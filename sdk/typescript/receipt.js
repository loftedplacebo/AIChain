const crypto = require("node:crypto");

const RECEIPT_DOMAIN = "aichain:avr:0.1.0-draft:";
const COMMITMENTS_DOMAIN = "aichain:avr:commitments:0.1.0-draft:";

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
  const { expected, ...payload } = receipt;
  const canonicalReceipt = canonicalize(payload);
  const canonicalCommitments = canonicalize(payload.commitments);
  return {
    canonicalReceipt,
    canonicalCommitments,
    receiptId: sha256Hex(RECEIPT_DOMAIN, canonicalReceipt),
    commitmentsRoot: sha256Hex(COMMITMENTS_DOMAIN, canonicalCommitments)
  };
}

module.exports = { canonicalize, deriveReceipt };
