// Reference canonicalisation for the additive development-only authorised AVR profile.

const crypto = require("node:crypto");
const { canonicalize } = require("./receipt");

const DOMAIN = "aichain:authorised-avr:0.2.0-draft:";
const COMMITMENTS_DOMAIN = "aichain:authorised-avr:commitments:0.2.0-draft:";
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const FIELDS = new Set(["schema", "schemaVersion", "assuranceLevel", "issuer", "identity", "execution", "commitments"]);
const IDENTITY_FIELDS = new Set(["organizationId", "authorityCommitment"]);
const COMMITMENT_FIELDS = new Set(["configuration", "input", "model", "output", "policy", "provider"]);

function exactKeys(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function hash(domain, value) {
  return `0x${crypto.createHash("sha256").update(domain, "utf8").update(value, "utf8").digest("hex")}`;
}

function validateAuthorisedReceipt(receipt) {
  if (!exactKeys(receipt, FIELDS)) throw new Error("Receipt fields do not match the authorised AVR draft shape");
  if (receipt.schema !== "aichain.authorised-avr" || receipt.schemaVersion !== "0.2.0-draft") throw new Error("Unsupported authorised AVR schema");
  if (receipt.assuranceLevel !== "organisation-authorised") throw new Error("assuranceLevel must be organisation-authorised");
  if (typeof receipt.issuer !== "string" || !ADDRESS.test(receipt.issuer)) throw new Error("issuer must be an EVM address");
  if (!exactKeys(receipt.identity, IDENTITY_FIELDS) || Object.values(receipt.identity).some((value) => typeof value !== "string" || !BYTES32.test(value))) {
    throw new Error("identity must contain bytes32 organizationId and authorityCommitment");
  }
  if (!exactKeys(receipt.execution, new Set(["claimedAt"])) || typeof receipt.execution.claimedAt !== "string" || !receipt.execution.claimedAt.endsWith("Z") || Number.isNaN(Date.parse(receipt.execution.claimedAt))) {
    throw new Error("execution.claimedAt must be an RFC 3339 UTC timestamp");
  }
  if (!exactKeys(receipt.commitments, COMMITMENT_FIELDS) || Object.values(receipt.commitments).some((value) => typeof value !== "string" || !BYTES32.test(value))) {
    throw new Error("commitments must contain six bytes32 values");
  }
}

function deriveAuthorisedReceipt(receipt) {
  validateAuthorisedReceipt(receipt);
  const canonicalReceipt = canonicalize(receipt);
  const canonicalCommitments = canonicalize(receipt.commitments);
  return { canonicalReceipt, canonicalCommitments, receiptId: hash(DOMAIN, canonicalReceipt), commitmentsRoot: hash(COMMITMENTS_DOMAIN, canonicalCommitments) };
}

function prepareAuthorisedAnchor(receipt) {
  const derived = deriveAuthorisedReceipt(receipt);
  return { ...derived, organizationId: receipt.identity.organizationId, authorityCommitment: receipt.identity.authorityCommitment, schemaVersion: receipt.schemaVersion, issuer: receipt.issuer };
}

module.exports = { validateAuthorisedReceipt, deriveAuthorisedReceipt, prepareAuthorisedAnchor };

