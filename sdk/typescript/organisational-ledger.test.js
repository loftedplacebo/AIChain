import test from "node:test";
import assert from "node:assert/strict";
import { createCheckpoint, membershipProof, verifyMembership } from "./organisational-ledger.js";

const receipts = [
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000000000000000000000000000003",
];

test("OVL checkpoint binds receipts with the ReceiptBatchAnchor-compatible Merkle root", () => {
  const checkpoint = createCheckpoint({
    organisationRef: "org:demo",
    ledgerId: "ledger:demo",
    epoch: 0,
    receiptIds: receipts,
    createdAt: "2026-08-22T12:00:00Z",
  });
  const proof = membershipProof(receipts, 2);
  assert.equal(checkpoint.leafCount, 3);
  assert.equal(verifyMembership(receipts[2], proof, checkpoint.receiptRoot), true);
  assert.equal(verifyMembership(receipts[1], proof, checkpoint.receiptRoot), false);
});

test("OVL checkpoint rejects an empty receipt set", () => {
  assert.throws(() => createCheckpoint({
    organisationRef: "org:demo",
    ledgerId: "ledger:demo",
    epoch: 0,
    receiptIds: [],
    createdAt: "2026-08-22T12:00:00Z",
  }), /at least one/);
});

