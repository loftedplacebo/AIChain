import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  hashPair,
  membershipProof,
  merkleRoot,
  readBatchManifestFile,
  validateBatchManifest,
  verifyMembership,
  verifyReceiptAgainstAnchor
} from "../lib/receipt-manifest.js";

const samplePath = new URL("../../build/base-sepolia/synthetic-anchor-manifest.json", import.meta.url);
const sample = JSON.parse(await readFile(samplePath, "utf8"));
const anchor = {
  verified: true,
  batchId: sample.batchId,
  batchRoot: sample.batchRoot,
  publisher: sample.publisher.toLowerCase(),
  leafCount: sample.leafCount,
  schemaVersion: sample.anchorSchemaVersion,
  transactionHash: "0xb23a4e1b9c4c1eed80e3cf4d27b2c21e00f0baaf09e8d1a9447a567caf1851bd"
};

test("uses Ethereum Keccak-256 and handles odd Merkle levels consistently", () => {
  assert.equal(hashPair(`0x${"00".repeat(32)}`, `0x${"11".repeat(32)}`), "0x8e4b8e18156a1c7271055ce5b7ef53bb370294ebd631a3b95418a92da46e681f");
  assert.equal(merkleRoot([sample.receiptId]), sample.batchRoot);
  assert.equal(verifyMembership(sample.receiptId, [], sample.batchRoot), true);
});

test("builds and verifies proofs for every leaf in even and odd batches", () => {
  const receiptIds = ["01", "02", "03", "04", "05"].map((byte) => `0x${byte.repeat(32)}`);
  const root = merkleRoot(receiptIds);
  for (let index = 0; index < receiptIds.length; index += 1) {
    assert.equal(verifyMembership(receiptIds[index], membershipProof(receiptIds, index), root), true, `leaf ${index}`);
  }
  assert.equal(verifyMembership(`0x${"ff".repeat(32)}`, membershipProof(receiptIds, 4), root), false);
});

test("accepts a bounded manifest file and verifies membership against its canonical anchor fields", async () => {
  const file = { size: Buffer.byteLength(JSON.stringify(sample)), text: async () => JSON.stringify(sample) };
  const manifest = await readBatchManifestFile(file);
  const result = verifyReceiptAgainstAnchor(manifest, sample.receiptId, anchor);
  assert.equal(result.verified, true);
  assert.equal(result.leafIndex, 0);
  assert.deepEqual(result.proof, []);
});

test("fails closed on root, duplicate, oversized and anchor identity mismatches", () => {
  assert.throws(() => validateBatchManifest({ ...sample, batchRoot: `0x${"00".repeat(32)}` }), /do not produce/);
  assert.throws(() => validateBatchManifest({ ...sample, receiptIds: [sample.receiptId, sample.receiptId], leafCount: 2 }), /duplicate/);
  assert.throws(() => verifyReceiptAgainstAnchor(sample, sample.receiptId, { ...anchor, batchId: `0x${"ff".repeat(32)}` }), /does not match/);
  assert.throws(() => verifyReceiptAgainstAnchor(sample, sample.receiptId, { ...anchor, verified: false }), /canonical anchor/);
});

test("reports non-membership without claiming a valid receipt proof", () => {
  const result = verifyReceiptAgainstAnchor(sample, `0x${"99".repeat(32)}`, anchor);
  assert.equal(result.verified, false);
  assert.match(result.message, /not in/);
});

test("rejects invalid JSON and files over the local size limit", async () => {
  await assert.rejects(readBatchManifestFile({ size: 2, text: async () => "{" }), /valid JSON/);
  await assert.rejects(readBatchManifestFile({ size: 2 * 1024 * 1024 + 1, text: async () => "{}" }), /2 MB/);
});
