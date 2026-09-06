// Local alpha AVR acceptance and micro-batching policy. No private data is persisted.
const { createManifest } = require("./avr-event-indexer");
const { validatePresentation } = require("./avr-presentation");

const DEFAULT_POLICY = Object.freeze({ microBatchMs: 250, maxQueueReceipts: 10_000, maxBatchReceipts: 1_000, maxAttempts: 3 });

class AvrIngressQueue {
  constructor(policy = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    for (const key of Object.keys(DEFAULT_POLICY)) if (!Number.isInteger(this.policy[key]) || this.policy[key] < 1) throw new Error(`policy.${key} must be a positive integer`);
    this.pending = []; this.records = new Map(); this.sequence = 0;
  }
  submit(presentation, now = Date.now()) {
    validatePresentation(presentation);
    const receiptId = presentation.receiptId.toLowerCase();
    const existing = this.records.get(receiptId);
    if (existing) return { accepted: false, duplicate: true, receiptId, status: existing.status };
    if (this.pending.length >= this.policy.maxQueueReceipts) return { accepted: false, duplicate: false, receiptId, status: "rejected-queue-full" };
    const entry = { receiptId, presentation, acceptedAt: now, attempts: 0, status: "accepted", batchId: null, anchor: null };
    this.records.set(receiptId, entry); this.pending.push(entry);
    return { accepted: true, duplicate: false, receiptId, status: entry.status };
  }
  drain(now = Date.now(), force = false) {
    if (!this.pending.length) return null;
    if (!force && this.pending.length < this.policy.maxBatchReceipts && now - this.pending[0].acceptedAt < this.policy.microBatchMs) return null;
    const entries = this.pending.splice(0, this.policy.maxBatchReceipts);
    const batchId = `local-${++this.sequence}`;
    const manifest = createManifest(entries.map((entry) => entry.receiptId));
    for (const entry of entries) { entry.status = "queued-for-anchor"; entry.batchId = batchId; entry.attempts += 1; }
    return { batchId, manifest, receiptIds: entries.map((entry) => entry.receiptId), createdAt: now };
  }
  recordAnchorResult(batch, result) {
    if (!batch?.receiptIds || !result?.status) throw new Error("batch and result status are required");
    for (const receiptId of batch.receiptIds) {
      const entry = this.records.get(receiptId);
      if (!entry) continue;
      if (result.status === "included") { entry.status = "provisionally-included"; entry.anchor = result.anchor ?? null; }
      else if (result.status === "reorged") { entry.status = "accepted"; entry.anchor = null; this.pending.push(entry); }
      else if (result.status === "retryable" && entry.attempts < this.policy.maxAttempts) { entry.status = "accepted"; this.pending.push(entry); }
      else entry.status = "failed";
    }
  }
  get(receiptId) { return this.records.get(receiptId.toLowerCase()) ?? null; }
}
module.exports = { DEFAULT_POLICY, AvrIngressQueue };
