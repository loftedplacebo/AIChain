// Development-only Organisational Verification Ledger (OVL) checkpoint helpers.
// This intentionally reuses the sorted Keccak-256 Merkle semantics of ReceiptBatchAnchor.

import { concat, keccak256 } from "ethers";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

export const CHECKPOINT_SCHEMA = "aichain.ovl-checkpoint";
export const CHECKPOINT_VERSION = "0.1.0-draft";

function requireBytes32(value, name) {
  if (typeof value !== "string" || !BYTES32.test(value)) {
    throw new Error(`${name} must be a 32-byte hex value`);
  }
  return value.toLowerCase();
}

export function hashPair(left, right) {
  const normalLeft = requireBytes32(left, "left");
  const normalRight = requireBytes32(right, "right");
  return normalLeft <= normalRight
    ? keccak256(concat([normalLeft, normalRight]))
    : keccak256(concat([normalRight, normalLeft]));
}

export function merkleRoot(receiptIds) {
  if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
    throw new Error("receiptIds must contain at least one receipt ID");
  }
  let level = receiptIds.map((receiptId, index) => requireBytes32(receiptId, `receiptIds[${index}]`));
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(hashPair(level[index], level[index + 1] ?? level[index]));
    }
    level = next;
  }
  return level[0];
}

export function membershipProof(receiptIds, leafIndex) {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= receiptIds.length) {
    throw new Error("leafIndex is outside receiptIds");
  }
  let index = leafIndex;
  let level = receiptIds.map((receiptId, itemIndex) => requireBytes32(receiptId, `receiptIds[${itemIndex}]`));
  const proof = [];
  while (level.length > 1) {
    const siblingIndex = index ^ 1;
    proof.push(level[siblingIndex] ?? level[index]);
    const next = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) {
      next.push(hashPair(level[cursor], level[cursor + 1] ?? level[cursor]));
    }
    level = next;
    index = Math.floor(index / 2);
  }
  return proof;
}

export function verifyMembership(receiptId, proof, root) {
  let computed = requireBytes32(receiptId, "receiptId");
  for (const [index, sibling] of proof.entries()) {
    computed = hashPair(computed, requireBytes32(sibling, `proof[${index}]`));
  }
  return computed === requireBytes32(root, "root");
}

export function createCheckpoint({ organisationRef, ledgerId, epoch, previousCheckpoint = null, receiptIds, createdAt }) {
  if (typeof organisationRef !== "string" || !organisationRef) throw new Error("organisationRef is required");
  if (typeof ledgerId !== "string" || !ledgerId) throw new Error("ledgerId is required");
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("epoch must be a non-negative safe integer");
  if (previousCheckpoint !== null) requireBytes32(previousCheckpoint, "previousCheckpoint");
  if (typeof createdAt !== "string" || !createdAt.endsWith("Z") || Number.isNaN(Date.parse(createdAt))) {
    throw new Error("createdAt must be an RFC 3339 UTC timestamp");
  }
  const normalizedIds = receiptIds.map((receiptId, index) => requireBytes32(receiptId, `receiptIds[${index}]`));
  const receiptRoot = merkleRoot(normalizedIds);
  return {
    schema: CHECKPOINT_SCHEMA,
    schemaVersion: CHECKPOINT_VERSION,
    organisationRef,
    ledgerId,
    epoch,
    previousCheckpoint: previousCheckpoint?.toLowerCase() ?? null,
    receiptRoot,
    leafCount: normalizedIds.length,
    createdAt,
    cryptoSuite: "TBD",
    signature: null,
    receiptIds: normalizedIds,
  };
}

