export const MANIFEST_SCHEMA = "aichain.avr-batch-manifest";
export const MANIFEST_VERSION = "0.1.0-draft";
export const MAX_MANIFEST_RECEIPTS = 10_000;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MASK_64 = (1n << 64n) - 1n;
const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const ROTATIONS = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

function rotateLeft(value, shift) {
  if (shift === 0) return value;
  const amount = BigInt(shift);
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

function keccakPermutation(state) {
  for (const roundConstant of ROUND_CONSTANTS) {
    const columns = new Array(5);
    for (let x = 0; x < 5; x += 1) columns[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    const delta = columns.map((_, x) => columns[(x + 4) % 5] ^ rotateLeft(columns[(x + 1) % 5], 1));
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) state[x + 5 * y] ^= delta[x];
    const moved = new Array(25).fill(0n);
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) {
      const newX = y;
      const newY = (2 * x + 3 * y) % 5;
      moved[newX + 5 * newY] = rotateLeft(state[x + 5 * y], ROTATIONS[x + 5 * y]);
    }
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 5; x += 1) {
      state[x + 5 * y] = moved[x + 5 * y] ^ ((~moved[(x + 1) % 5 + 5 * y]) & moved[(x + 2) % 5 + 5 * y]);
    }
    state[0] ^= roundConstant;
  }
}

function keccak256Bytes(input) {
  const rate = 136;
  const paddedLength = Math.ceil((input.length + 1) / rate) * rate;
  const padded = new Uint8Array(paddedLength || rate);
  padded.set(input);
  padded[input.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const state = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate; i += 1) state[Math.floor(i / 8)] ^= BigInt(padded[offset + i]) << BigInt((i % 8) * 8);
    keccakPermutation(state);
  }
  const output = new Uint8Array(32);
  for (let i = 0; i < output.length; i += 1) output[i] = Number((state[Math.floor(i / 8)] >> BigInt((i % 8) * 8)) & 0xffn);
  return `0x${Array.from(output, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function hexBytes(value) {
  return Uint8Array.from(value.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

function bytes32(value, label) {
  if (typeof value !== "string" || !BYTES32.test(value)) throw new Error(`${label} must be a 32-byte hex value`);
  return value.toLowerCase();
}

function hashPair(left, right) {
  const a = bytes32(left, "Merkle node");
  const b = bytes32(right, "Merkle node");
  const first = a <= b ? a : b;
  const second = a <= b ? b : a;
  const pair = new Uint8Array(64);
  pair.set(hexBytes(first.slice(2)));
  pair.set(hexBytes(second.slice(2)), 32);
  return keccak256Bytes(pair);
}

export { hashPair };

export function merkleRoot(receiptIds) {
  if (!Array.isArray(receiptIds) || receiptIds.length === 0) throw new Error("The receipt list must not be empty");
  let level = receiptIds.map((id) => bytes32(id, "Receipt ID"));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i], level[i + 1] ?? level[i]));
    level = next;
  }
  return level[0];
}

export function validateBatchManifest(manifest) {
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA || manifest.schemaVersion !== MANIFEST_VERSION || !Array.isArray(manifest.receiptIds)) {
    throw new Error("Unsupported manifest. Select an AVR batch manifest (aichain.avr-batch-manifest, version 0.1.0-draft).");
  }
  if (manifest.receiptIds.length < 1 || manifest.receiptIds.length > MAX_MANIFEST_RECEIPTS || manifest.leafCount !== manifest.receiptIds.length) {
    throw new Error(`The manifest must contain between 1 and ${MAX_MANIFEST_RECEIPTS.toLocaleString()} receipts, and its count must match.`);
  }
  if (typeof manifest.anchorSchemaVersion !== "string" || manifest.anchorSchemaVersion.length < 1 || manifest.anchorSchemaVersion.length > 128) {
    throw new Error("The manifest has an invalid anchor schema version.");
  }
  if (typeof manifest.publisher !== "string" || !ADDRESS.test(manifest.publisher)) throw new Error("The manifest has an invalid publisher address.");
  const batchId = bytes32(manifest.batchId, "Batch ID");
  const declaredRoot = bytes32(manifest.batchRoot, "Batch root");
  const receiptIds = manifest.receiptIds.map((id) => bytes32(id, "Receipt ID"));
  if (new Set(receiptIds).size !== receiptIds.length) throw new Error("The manifest contains duplicate receipt IDs.");
  const computedRoot = merkleRoot(receiptIds);
  if (computedRoot !== declaredRoot) throw new Error("The receipt IDs do not produce the batch root declared in the manifest.");
  return { schema: MANIFEST_SCHEMA, schemaVersion: MANIFEST_VERSION, batchId, batchRoot: declaredRoot, publisher: manifest.publisher.toLowerCase(), leafCount: receiptIds.length, anchorSchemaVersion: manifest.anchorSchemaVersion, receiptIds };
}

export function membershipProof(receiptIds, leafIndex) {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= receiptIds.length) throw new Error("Receipt is not present in this manifest.");
  let level = receiptIds.map((id) => bytes32(id, "Receipt ID"));
  let index = leafIndex;
  const siblings = [];
  while (level.length > 1) {
    siblings.push(level[index ^ 1] ?? level[index]);
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i], level[i + 1] ?? level[i]));
    level = next;
    index = Math.floor(index / 2);
  }
  return siblings;
}

export function verifyMembership(receiptId, siblings, expectedRoot) {
  let current = bytes32(receiptId, "Receipt ID");
  for (const sibling of siblings) current = hashPair(current, sibling);
  return current === bytes32(expectedRoot, "Batch root");
}

export function verifyReceiptAgainstAnchor(manifestInput, receiptIdInput, anchor) {
  if (!anchor?.verified) throw new Error("Verify a successful, canonical anchor transaction first.");
  const manifest = validateBatchManifest(manifestInput);
  const receiptId = bytes32(receiptIdInput, "Receipt ID");
  if (manifest.batchId !== bytes32(anchor.batchId, "On-chain batch ID") || manifest.batchRoot !== bytes32(anchor.batchRoot, "On-chain batch root") || manifest.publisher !== anchor.publisher.toLowerCase() || manifest.leafCount !== anchor.leafCount || manifest.anchorSchemaVersion !== anchor.schemaVersion) {
    throw new Error("Manifest identity or metadata does not match the verified Base Sepolia anchor.");
  }
  const index = manifest.receiptIds.indexOf(receiptId);
  if (index < 0) return { verified: false, receiptId, proof: [], message: "This receipt ID is not in the anchored batch manifest." };
  const proof = membershipProof(manifest.receiptIds, index);
  const verified = verifyMembership(receiptId, proof, anchor.batchRoot);
  if (!verified) throw new Error("The generated inclusion proof does not match the anchored root.");
  return { verified, receiptId, proof, leafIndex: index, message: "Receipt membership verified against the batch root in the confirmed Base Sepolia anchor." };
}

export async function readBatchManifestFile(file) {
  if (!file) throw new Error("Choose a batch manifest file.");
  if (file.size > MAX_MANIFEST_BYTES) throw new Error("Manifest file exceeds the 2 MB local verification limit.");
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { throw new Error("The selected file is not valid JSON."); }
  return validateBatchManifest(parsed);
}
