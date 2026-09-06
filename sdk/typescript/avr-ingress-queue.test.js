const assert = require("node:assert/strict");
const fs = require("node:fs"); const path = require("node:path"); const test = require("node:test");
const { AvrIngressQueue } = require("./avr-ingress-queue");
const { createPresentation } = require("./avr-presentation");
const base = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "fixtures", "avr", "receipt-v0.1.0-draft.json"), "utf8"));
function presentation(seed) { const receipt = structuredClone(base); receipt.commitments.input = `0x${seed.toString(16).padStart(64, "0")}`; return createPresentation(receipt, { level: "commitment-only" }); }

test("accepts once, deduplicates, micro-batches and records inclusion", () => {
  const queue = new AvrIngressQueue({ microBatchMs: 100, maxBatchReceipts: 2 }); const first = presentation(1); const second = presentation(2);
  assert.equal(queue.submit(first, 0).accepted, true); assert.equal(queue.submit(first, 1).duplicate, true); queue.submit(second, 2);
  const batch = queue.drain(2); assert.equal(batch.receiptIds.length, 2); assert.equal(queue.get(first.receiptId).status, "queued-for-anchor");
  queue.recordAnchorResult(batch, { status: "included", anchor: { blockNumber: 1 } }); assert.equal(queue.get(first.receiptId).status, "provisionally-included");
});
test("bounds the queue and retries only within the policy", () => {
  const queue = new AvrIngressQueue({ maxQueueReceipts: 1, maxAttempts: 1 }); const first = presentation(3); const second = presentation(4);
  queue.submit(first, 0); assert.equal(queue.submit(second, 0).status, "rejected-queue-full"); const batch = queue.drain(1000, true);
  queue.recordAnchorResult(batch, { status: "retryable" }); assert.equal(queue.get(first.receiptId).status, "failed");
});
