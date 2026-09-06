// Versioned, proof-aware Merkle batches for the ZK-003 alpha scope.
// This commits public proof-claim bindings only. It never contains witnesses,
// raw AI data, or proof bytes themselves.

import { concat, keccak256, toUtf8Bytes } from "ethers";
import { membershipProof, merkleRoot, verifyMembership } from "./organisational-ledger.js";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const LEAF_DOMAIN = "aichain:zk-proof-batch-leaf:0.1.0-draft:";

export const PROOF_BATCH_SCHEMA = "aichain.zk-proof-batch";
export const PROOF_BATCH_VERSION = "0.1.0-draft";

function requireBytes32(value, name) {
  if (typeof value !== "string" || !BYTES32.test(value)) throw new Error(`${name} must be a 32-byte hex value`);
  return value.toLowerCase();
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value;
}

export function proofSystemId(system, version) {
  return keccak256(toUtf8Bytes(`aichain:zk-proof-system:0.1.0-draft:${requireText(system, "system")}:${requireText(version, "version")}`));
}

export function proofClaimLeaf(claim) {
  const proofSystem = requireBytes32(claim.proofSystemId, "proofSystemId");
  const statement = requireBytes32(claim.statementId, "statementId");
  const program = requireBytes32(claim.programCommitment, "programCommitment");
  const receipt = requireBytes32(claim.receiptId, "receiptId");
  const publicValues = requireBytes32(claim.publicValuesDigest, "publicValuesDigest");
  const proof = requireBytes32(claim.proofDigest, "proofDigest");
  return keccak256(concat([toUtf8Bytes(LEAF_DOMAIN), proofSystem, statement, program, receipt, publicValues, proof]));
}

function normaliseClaim(claim, index) {
  return {
    proofSystemId: requireBytes32(claim.proofSystemId, `claims[${index}].proofSystemId`),
    statementId: requireBytes32(claim.statementId, `claims[${index}].statementId`),
    programCommitment: requireBytes32(claim.programCommitment, `claims[${index}].programCommitment`),
    receiptId: requireBytes32(claim.receiptId, `claims[${index}].receiptId`),
    publicValuesDigest: requireBytes32(claim.publicValuesDigest, `claims[${index}].publicValuesDigest`),
    proofDigest: requireBytes32(claim.proofDigest, `claims[${index}].proofDigest`),
  };
}

export function createProofBatch({ proofSystemId, statementId, programCommitment, claims, createdAt }) {
  const system = requireBytes32(proofSystemId, "proofSystemId");
  const statement = requireBytes32(statementId, "statementId");
  const program = requireBytes32(programCommitment, "programCommitment");
  if (!Array.isArray(claims) || claims.length === 0) throw new Error("claims must contain at least one proof claim");
  if (typeof createdAt !== "string" || !createdAt.endsWith("Z") || Number.isNaN(Date.parse(createdAt))) throw new Error("createdAt must be an RFC 3339 UTC timestamp");
  const normalizedClaims = claims.map(normaliseClaim);
  const receiptIds = new Set();
  for (const [index, claim] of normalizedClaims.entries()) {
    if (claim.proofSystemId !== system || claim.statementId !== statement || claim.programCommitment !== program) throw new Error(`claims[${index}] does not match the batch proof-system, statement, or program binding`);
    if (receiptIds.has(claim.receiptId)) throw new Error(`claims[${index}] duplicates a receiptId`);
    receiptIds.add(claim.receiptId);
  }
  const leaves = normalizedClaims.map(proofClaimLeaf);
  return { schema: PROOF_BATCH_SCHEMA, schemaVersion: PROOF_BATCH_VERSION, proofSystemId: system, statementId: statement, programCommitment: program, createdAt, claimCount: normalizedClaims.length, claimRoot: merkleRoot(leaves), claims: normalizedClaims };
}

export function proofClaimInclusion(batch, claimIndex) {
  if (!batch || batch.schema !== PROOF_BATCH_SCHEMA || batch.schemaVersion !== PROOF_BATCH_VERSION) throw new Error("unsupported proof batch schema");
  if (!Number.isInteger(claimIndex) || claimIndex < 0 || claimIndex >= batch.claims.length) throw new Error("claimIndex is outside batch claims");
  const claim = normaliseClaim(batch.claims[claimIndex], claimIndex);
  const leaves = batch.claims.map(proofClaimLeaf);
  return { schema: "aichain.zk-proof-claim-inclusion", schemaVersion: PROOF_BATCH_VERSION, claimIndex, claim, siblings: membershipProof(leaves, claimIndex) };
}

export function verifyProofClaimInclusion(batch, inclusion) {
  if (!batch || batch.schema !== PROOF_BATCH_SCHEMA || batch.schemaVersion !== PROOF_BATCH_VERSION) return false;
  if (!inclusion || inclusion.schema !== "aichain.zk-proof-claim-inclusion" || inclusion.schemaVersion !== PROOF_BATCH_VERSION) return false;
  try {
    const claim = normaliseClaim(inclusion.claim, inclusion.claimIndex ?? 0);
    if (claim.proofSystemId !== batch.proofSystemId || claim.statementId !== batch.statementId || claim.programCommitment !== batch.programCommitment) return false;
    return verifyMembership(proofClaimLeaf(claim), inclusion.siblings, batch.claimRoot);
  } catch { return false; }
}
