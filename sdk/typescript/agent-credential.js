// Development-only signed agent-credential envelope. EIP-191 is a transport/profile experiment only.

const crypto = require("node:crypto");
const { getBytes, verifyMessage } = require("ethers");
const { canonicalize } = require("./receipt");

const DOMAIN = "aichain:agent-credential:0.1.0-draft:";
const MESSAGE_DOMAIN = "AIChain agent credential v0.1.0-draft: ";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const FIELDS = new Set(["schema", "schemaVersion", "issuer", "subject", "organizationId", "authorityCommitment", "policyCommitment", "configurationCommitment", "validAfter", "validUntil"]);

function exactKeys(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === FIELDS.size && Object.keys(value).every((key) => FIELDS.has(key));
}

function validateAgentCredential(credential) {
  if (!exactKeys(credential)) throw new Error("Agent credential fields do not match the draft shape");
  if (credential.schema !== "aichain.agent-credential" || credential.schemaVersion !== "0.1.0-draft") throw new Error("Unsupported agent credential schema");
  if (![credential.issuer, credential.subject].every((value) => typeof value === "string" && ADDRESS.test(value))) throw new Error("issuer and subject must be EVM addresses");
  for (const field of ["organizationId", "authorityCommitment", "policyCommitment", "configurationCommitment"]) {
    if (typeof credential[field] !== "string" || !BYTES32.test(credential[field])) throw new Error(`${field} must be bytes32`);
  }
  if (![credential.validAfter, credential.validUntil].every((value) => typeof value === "string" && value.endsWith("Z") && !Number.isNaN(Date.parse(value)))) {
    throw new Error("validAfter and validUntil must be RFC 3339 UTC timestamps");
  }
  if (Date.parse(credential.validUntil) <= Date.parse(credential.validAfter)) throw new Error("validUntil must be after validAfter");
}

function deriveAgentCredential(credential) {
  validateAgentCredential(credential);
  const canonicalCredential = canonicalize(credential);
  const credentialId = `0x${crypto.createHash("sha256").update(DOMAIN, "utf8").update(canonicalCredential, "utf8").digest("hex")}`;
  return { canonicalCredential, credentialId, message: `${MESSAGE_DOMAIN}${credentialId}` };
}

function verifyCredentialPackage(packageValue) {
  const credential = packageValue?.credential;
  const proof = packageValue?.proof;
  const derived = deriveAgentCredential(credential);
  if (!proof || proof.scheme !== "eip191-personal-sign" || proof.credentialId?.toLowerCase() !== derived.credentialId.toLowerCase()) {
    return { valid: false, reason: "invalid proof envelope" };
  }
  const recovered = verifyMessage(getBytes(derived.credentialId), proof.signature);
  const issuerMatches = recovered.toLowerCase() === credential.issuer.toLowerCase();
  return { credentialId: derived.credentialId, recovered, issuerMatches, valid: issuerMatches };
}

module.exports = { deriveAgentCredential, validateAgentCredential, verifyCredentialPackage };

