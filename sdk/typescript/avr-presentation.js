// Phase 2D alpha application presentation for existing AVR receipts.
//
// This is additive. It neither changes receipt IDs nor changes what the L1
// contracts accept. It is a canonical, portable description of what evidence
// an application is presenting alongside a v0.1 or v0.2 AVR receipt.

const crypto = require("node:crypto");
const { canonicalize, deriveReceipt } = require("./receipt");
const { deriveAuthorisedReceipt } = require("./authorised-receipt");

const DOMAIN = "aichain:avr-presentation:0.3.0-alpha:";
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ASSURANCE_LEVELS = new Set([
  "commitment-only",
  "issuer-attested",
  "organisation-authorised",
  "zk-proved"
]);

function exactKeys(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === expected.size && Object.keys(value).every((key) => expected.has(key));
}

function deriveUnderlyingReceipt(receipt) {
  if (receipt?.schema === "aichain.avr") return deriveReceipt(receipt);
  if (receipt?.schema === "aichain.authorised-avr") return deriveAuthorisedReceipt(receipt);
  throw new Error("Unsupported AVR receipt schema");
}

function validateAnchor(anchor) {
  if (anchor === null || typeof anchor !== "object" || Array.isArray(anchor)
    || !Object.keys(anchor).every((key) => new Set(["mode", "chainId", "contract", "transactionHash", "batch"]).has(key))
    || !["mode", "chainId", "contract", "transactionHash"].every((key) => Object.hasOwn(anchor, key))) {
    throw new Error("anchor must contain mode, chainId, contract, and transactionHash");
  }
  if (!new Set(["individual", "batch"]).has(anchor.mode)) throw new Error("anchor.mode must be individual or batch");
  if (!Number.isInteger(anchor.chainId) || anchor.chainId < 0) throw new Error("anchor.chainId must be a non-negative integer");
  if (!ADDRESS.test(anchor.contract)) throw new Error("anchor.contract must be an EVM address");
  if (!BYTES32.test(anchor.transactionHash)) throw new Error("anchor.transactionHash must be a bytes32 transaction hash");
  if (anchor.mode !== "batch" && anchor.batch !== undefined) throw new Error("anchor.batch is only valid for batch mode");
}

function validateProof(proof) {
  if (!exactKeys(proof, new Set(["system", "programCommitment", "publicValuesDigest", "proofDigest", "verification"]))) {
    throw new Error("proof must contain system, programCommitment, publicValuesDigest, proofDigest, and verification");
  }
  if (proof.system !== "risc0") throw new Error("Only the selected alpha proof system, risc0, is supported");
  if (![proof.programCommitment, proof.publicValuesDigest, proof.proofDigest].every((value) => typeof value === "string" && BYTES32.test(value))) {
    throw new Error("proof commitments must be bytes32 values");
  }
  if (!new Set(["individually-verified", "batch-claim"]).has(proof.verification)) {
    throw new Error("proof.verification must be individually-verified or batch-claim");
  }
}

function validateAssurance(assurance, receipt) {
  if (assurance === null || typeof assurance !== "object" || Array.isArray(assurance)
    || !Object.keys(assurance).every((key) => new Set(["level", "attestation", "proof"]).has(key))) {
    throw new Error("assurance contains unsupported fields");
  }
  if (!ASSURANCE_LEVELS.has(assurance.level)) throw new Error("Unsupported assurance level");
  if (assurance.level === "issuer-attested") {
    if (!exactKeys(assurance.attestation, new Set(["scheme", "signer", "signature"]))) throw new Error("issuer-attested evidence is required");
    if (assurance.attestation.scheme !== "eip191-personal-sign" || !ADDRESS.test(assurance.attestation.signer)
      || typeof assurance.attestation.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(assurance.attestation.signature)) {
      throw new Error("Invalid issuer attestation");
    }
  } else if (assurance.attestation !== undefined) {
    throw new Error("attestation is only valid for issuer-attested presentations");
  }
  if (assurance.level === "organisation-authorised" && receipt.schema !== "aichain.authorised-avr") {
    throw new Error("organisation-authorised assurance requires an authorised AVR receipt");
  }
  if (assurance.level === "zk-proved") {
    validateProof(assurance.proof);
  } else if (assurance.proof !== undefined) {
    throw new Error("proof is only valid for zk-proved presentations");
  }
}

function validatePresentation(presentation) {
  if (!exactKeys(presentation, new Set(["schema", "schemaVersion", "receipt", "receiptId", "commitmentsRoot", "assurance", "anchor"]))) {
    throw new Error("Presentation fields do not match the AVR alpha shape");
  }
  if (presentation.schema !== "aichain.avr-presentation" || presentation.schemaVersion !== "0.3.0-alpha") {
    throw new Error("Unsupported AVR presentation schema");
  }
  const derived = deriveUnderlyingReceipt(presentation.receipt);
  if (presentation.receiptId !== derived.receiptId || presentation.commitmentsRoot !== derived.commitmentsRoot) {
    throw new Error("Presentation receipt identifiers do not match the embedded receipt");
  }
  validateAssurance(presentation.assurance, presentation.receipt);
  if (presentation.anchor !== null) validateAnchor(presentation.anchor);
}

function createPresentation(receipt, assurance, anchor = null) {
  const derived = deriveUnderlyingReceipt(receipt);
  const presentation = {
    schema: "aichain.avr-presentation",
    schemaVersion: "0.3.0-alpha",
    receipt,
    receiptId: derived.receiptId,
    commitmentsRoot: derived.commitmentsRoot,
    assurance,
    anchor
  };
  validatePresentation(presentation);
  return presentation;
}

function derivePresentation(presentation) {
  validatePresentation(presentation);
  const canonicalPresentation = canonicalize(presentation);
  return {
    canonicalPresentation,
    presentationId: `0x${crypto.createHash("sha256").update(DOMAIN, "utf8").update(canonicalPresentation, "utf8").digest("hex")}`,
    receiptId: presentation.receiptId,
    commitmentsRoot: presentation.commitmentsRoot,
    assuranceLevel: presentation.assurance.level
  };
}

function assuranceSummary(presentation) {
  const derived = derivePresentation(presentation);
  return {
    receiptId: derived.receiptId,
    presentationId: derived.presentationId,
    assuranceLevel: derived.assuranceLevel,
    anchored: presentation.anchor !== null,
    anchorMode: presentation.anchor?.mode ?? null,
    proofSystem: presentation.assurance.proof?.system ?? null,
    proofVerification: presentation.assurance.proof?.verification ?? null,
    // The SDK never treats a receipt claim as a statement that an AI output is true.
    scope: "Evidence binds committed AVR data; it does not establish model-output truth."
  };
}

module.exports = { ASSURANCE_LEVELS, validatePresentation, createPresentation, derivePresentation, assuranceSummary };
