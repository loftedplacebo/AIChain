const crypto = require("node:crypto");
const { canonicalize } = require("./receipt");

const STATEMENT_VERSION = "0.1.0-draft";
const RECEIPT_VERSION = "0.2.0-draft";
const RULE_SET = "aichain.policy.allowlist-v1";
const BYTES32 = /^0x[0-9a-f]{64}$/;
const hashBytes = (value) => `0x${crypto.createHash("sha256").update(value).digest("hex")}`;
const hashText = (value) => hashBytes(Buffer.from(value, "utf8"));
const STATEMENT_ID = hashText("aichain:zk-statement:policy-evaluation:0.1.0-draft");
const PROGRAM_COMMITMENT = hashText("aichain:zk-program:policy-evaluation:allowlist-v1");

function exactKeys(value, keys, label) {
  if (!value || Array.isArray(value) || typeof value !== "object"
      || Object.keys(value).length !== keys.length || !Object.keys(value).every((key) => keys.includes(key))) {
    throw new Error(`${label} has unexpected fields`);
  }
}

function validateWitness(witness) {
  exactKeys(witness, ["action", "configuration", "policy", "blindings", "modelCommitment", "providerCommitment"], "witness");
  exactKeys(witness.action, ["operation", "resource", "amount"], "action");
  exactKeys(witness.configuration, ["enforceAmount", "enforceResource"], "configuration");
  exactKeys(witness.policy, ["allowedOperations", "allowedResources", "maxAmount"], "policy");
  exactKeys(witness.blindings, ["input", "output", "configuration", "policy"], "blindings");
  if (typeof witness.action.operation !== "string" || !witness.action.operation
      || typeof witness.action.resource !== "string" || !witness.action.resource) throw new Error("action strings must be non-empty");
  for (const value of [witness.action.amount, witness.policy.maxAmount]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("amounts must be non-negative safe integers");
  }
  if (typeof witness.configuration.enforceAmount !== "boolean" || typeof witness.configuration.enforceResource !== "boolean") throw new Error("configuration flags must be booleans");
  for (const key of ["allowedOperations", "allowedResources"]) {
    const values = witness.policy[key];
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)
        || JSON.stringify(values) !== JSON.stringify([...new Set(values)].sort())) throw new Error(`${key} must be sorted and unique`);
  }
  for (const value of [...Object.values(witness.blindings), witness.modelCommitment, witness.providerCommitment]) {
    if (typeof value !== "string" || !BYTES32.test(value)) throw new Error("commitments and blindings must be lowercase bytes32 values");
  }
}

function evaluate(witness) {
  validateWitness(witness);
  const reasons = [];
  if (!witness.policy.allowedOperations.includes(witness.action.operation)) reasons.push("operation-not-allowed");
  if (witness.configuration.enforceResource && !witness.policy.allowedResources.includes(witness.action.resource)) reasons.push("resource-not-allowed");
  if (witness.configuration.enforceAmount && witness.action.amount > witness.policy.maxAmount) reasons.push("amount-exceeds-limit");
  return { decision: reasons.length ? "deny" : "allow", reasonCodes: reasons, ruleSet: RULE_SET };
}

function blindedCommitment(kind, value, blinding) {
  return hashBytes(Buffer.concat([
    Buffer.from(`aichain:zk-witness:${STATEMENT_VERSION}:${kind}:`, "utf8"),
    Buffer.from(blinding.slice(2), "hex"),
    Buffer.from(canonicalize(value), "utf8")
  ]));
}

function derivePublic(metadata, witness) {
  exactKeys(metadata, ["issuer", "organizationId", "authorityCommitment", "claimedAtEpochSeconds"], "metadata");
  validateWitness(witness);
  if (!BYTES32.test(metadata.organizationId) || !BYTES32.test(metadata.authorityCommitment)) throw new Error("identity values must be lowercase bytes32");
  if (!Number.isSafeInteger(metadata.claimedAtEpochSeconds) || metadata.claimedAtEpochSeconds < 0) throw new Error("timestamp must be non-negative");
  const issuer = metadata.issuer.toLowerCase();
  const result = evaluate(witness);
  const commitments = {
    configuration: blindedCommitment("configuration", witness.configuration, witness.blindings.configuration),
    input: blindedCommitment("input", witness.action, witness.blindings.input),
    model: witness.modelCommitment,
    output: blindedCommitment("output", result, witness.blindings.output),
    policy: blindedCommitment("policy", witness.policy, witness.blindings.policy),
    provider: witness.providerCommitment
  };
  const commitmentsRoot = hashText(`aichain:authorised-avr:commitments:${RECEIPT_VERSION}:${canonicalize(commitments)}`);
  const receipt = {
    assuranceLevel: "organisation-authorised", commitments,
    execution: { claimedAt: new Date(metadata.claimedAtEpochSeconds * 1000).toISOString().replace(".000Z", "Z") },
    identity: { authorityCommitment: metadata.authorityCommitment, organizationId: metadata.organizationId },
    issuer, schema: "aichain.authorised-avr", schemaVersion: RECEIPT_VERSION
  };
  return {
    authorityCommitment: metadata.authorityCommitment,
    claimedAtEpochSeconds: metadata.claimedAtEpochSeconds,
    commitmentsRoot,
    decision: result.decision,
    issuer,
    organizationId: metadata.organizationId,
    programCommitment: PROGRAM_COMMITMENT,
    receiptId: hashText(`aichain:authorised-avr:${RECEIPT_VERSION}:${canonicalize(receipt)}`),
    resultCommitment: commitments.output,
    statementId: STATEMENT_ID
  };
}

function verify(document) {
  return canonicalize(derivePublic(document.publicMetadata, document.privateWitness)) === canonicalize(document.expectedPublic);
}

module.exports = { derivePublic, evaluate, verify };
