const crypto = require("node:crypto");

const RECEIPT_DOMAIN = "aichain:avr:0.1.0-draft:";
const COMMITMENTS_DOMAIN = "aichain:avr:commitments:0.1.0-draft:";
const ATTESTATION_MESSAGE_DOMAIN = "AIChain AVR v0.1.0-draft receipt: ";

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

module.exports = { canonicalize, deriveReceipt, prepareAnchor, prepareAttestation, verifyReceiptAgainstAnchor };
