const crypto = require("node:crypto");

const RECEIPT_DOMAIN = "aichain:avr:0.1.0-draft:";
const COMMITMENTS_DOMAIN = "aichain:avr:commitments:0.1.0-draft:";
const ATTESTATION_MESSAGE_DOMAIN = "AIChain AVR v0.1.0-draft receipt: ";
const RECEIPT_FIELDS = new Set(["schema", "schemaVersion", "assuranceLevel", "issuer", "execution", "commitments"]);
const COMMITMENT_FIELDS = new Set(["configuration", "input", "model", "output", "policy", "provider"]);
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function hasExactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.size && Object.keys(value).every((key) => keys.has(key));
}

function validateReceipt(receipt) {
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) throw new Error("Receipt must be an object");
  const { expected, attestation, ...payload } = receipt;
  if (!hasExactKeys(payload, RECEIPT_FIELDS)) throw new Error("Receipt fields do not match the AVR v0.1.0-draft shape");
  if (payload.schema !== "aichain.avr" || payload.schemaVersion !== "0.1.0-draft") throw new Error("Unsupported AVR schema or schema version");
  if (typeof payload.assuranceLevel !== "string" || !payload.assuranceLevel) throw new Error("assuranceLevel must be a non-empty string");
  if (typeof payload.issuer !== "string" || !ADDRESS.test(payload.issuer)) throw new Error("issuer must be a 20-byte EVM address");
  if (!hasExactKeys(payload.execution, new Set(["claimedAt"])) || typeof payload.execution.claimedAt !== "string"
    || !payload.execution.claimedAt.endsWith("Z") || Number.isNaN(Date.parse(payload.execution.claimedAt))) {
    throw new Error("claimedAt must be an RFC 3339 UTC timestamp");
  }
  if (!hasExactKeys(payload.commitments, COMMITMENT_FIELDS) || Object.values(payload.commitments).some((value) => typeof value !== "string" || !BYTES32.test(value))) {
    throw new Error("Each commitment must be a 32-byte hex value");
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(domain, canonicalValue) {
  return `0x${crypto.createHash("sha256").update(domain, "utf8").update(canonicalValue, "utf8").digest("hex")}`;
}

function deriveReceipt(receipt) {
  validateReceipt(receipt);
  const { expected, attestation, ...payload } = receipt;
  const canonicalReceipt = canonicalize(payload);
  const canonicalCommitments = canonicalize(payload.commitments);
  return {
    canonicalReceipt,
    canonicalCommitments,
    receiptId: sha256Hex(RECEIPT_DOMAIN, canonicalReceipt),
    commitmentsRoot: sha256Hex(COMMITMENTS_DOMAIN, canonicalCommitments)
  };
}

function prepareAttestation(receipt) {
  const { receiptId } = deriveReceipt(receipt);
  return {
    schema: "aichain.avr-attestation",
    schemaVersion: "0.1.0-draft",
    scheme: "eip191-personal-sign",
    receiptId,
    issuer: receipt.issuer,
    message: `${ATTESTATION_MESSAGE_DOMAIN}${receiptId}`
  };
}

function verifyReceiptAgainstAnchor(receipt, anchor) {
  const derived = deriveReceipt(receipt);
  const issuerMatches = !anchor.issuer || !receipt.issuer || anchor.issuer.toLowerCase() === receipt.issuer.toLowerCase();
  const result = {
    receiptId: derived.receiptId,
    commitmentsRoot: derived.commitmentsRoot,
    receiptIdMatches: !anchor.receiptId || anchor.receiptId.toLowerCase() === derived.receiptId.toLowerCase(),
    commitmentsRootMatches: anchor.commitmentsRoot.toLowerCase() === derived.commitmentsRoot.toLowerCase(),
    schemaVersionMatches: anchor.schemaVersion === receipt.schemaVersion,
    issuerMatches
  };
  return { ...result, valid: result.receiptIdMatches && result.commitmentsRootMatches && result.schemaVersionMatches && result.issuerMatches };
}

function prepareAnchor(receipt) {
  const derived = deriveReceipt(receipt);
  return {
    receiptId: derived.receiptId,
    commitmentsRoot: derived.commitmentsRoot,
    schemaVersion: receipt.schemaVersion,
    claimedIssuer: receipt.issuer
  };
}

module.exports = { canonicalize, validateReceipt, deriveReceipt, prepareAnchor, prepareAttestation, verifyReceiptAgainstAnchor };
