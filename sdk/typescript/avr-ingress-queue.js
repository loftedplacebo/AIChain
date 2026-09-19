// Local alpha AVR acceptance and micro-batching policy. No private data is persisted.
const { createManifest } = require("./avr-event-indexer");
const { validatePresentation } = require("./avr-presentation");
const { SCHEMA: GENERAL_SCHEMA } = require('./verification-receipt');

const DEFAULT_POLICY = Object.freeze({ microBatchMs: 250, maxQueueReceipts: 10_000, maxBatchReceipts: 1_000, maxAttempts: 3, maxPresentationBytes: 16384 });
const SNAPSHOT_SCHEMA = "aichain.avr-ingress-queue";
const SNAPSHOT_VERSION = "0.1.0-draft";

class AvrIngressQueue {
  constructor(policy = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    for (const key of Object.keys(DEFAULT_POLICY)) if (!Number.isInteger(this.policy[key]) || this.policy[key] < 1) throw new Error(`policy.${key} must be a positive integer`);
    this.pending = []; this.records = new Map(); this.sequence = 0;
    this.anchorContext = null;
  }
  submit(presentation, now = Date.now()) {
    if (Buffer.byteLength(JSON.stringify(presentation)) > this.policy.maxPresentationBytes) return {accepted:false,status:'rejected-presentation-too-large'};
    validatePresentation(presentation);
    const receiptId = presentation.receiptId.toLowerCase();
    const existing = this.records.get(receiptId);
    if (existing) return { accepted: false, duplicate: true, receiptId, status: existing.status };
    const context = presentation.receipt.schema === GENERAL_SCHEMA ? presentation.receipt.context : null;
    if (context && this.anchorContext && (context.chainId !== this.anchorContext.chainId || context.anchorContract !== this.anchorContext.anchorContract)) {
      return { accepted: false, receiptId, status: 'rejected-anchor-context' };
    }
    // Bound retained deduplication state as well as pending work. Alpha queues
    // must be rotated explicitly after reconciliation, never silently evicted.
    if (this.records.size >= this.policy.maxQueueReceipts) return { accepted: false, duplicate: false, receiptId, status: "rejected-queue-full" };
    if (context && !this.anchorContext) this.anchorContext = { ...context };
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
    return { batchId, manifest, receiptIds: entries.map((entry) => entry.receiptId), createdAt: now,
      ...(this.anchorContext ? { anchorContext: { ...this.anchorContext } } : {}) };
  }
  recordAnchorResult(batch, result) {
    if (!batch?.receiptIds || !result?.status) throw new Error("batch and result status are required");
    for (const receiptId of batch.receiptIds) {
      const entry = this.records.get(receiptId);
      if (!entry || entry.batchId !== batch.batchId) continue;
      if (result.status === "reorged" ? entry.status !== "provisionally-included" : entry.status !== "queued-for-anchor") continue;
      if (result.status === "included") { entry.status = "provisionally-included"; entry.anchor = result.anchor ?? null; }
      else if (result.status === "reorged" && entry.attempts < this.policy.maxAttempts) { entry.status = "accepted"; entry.anchor = null; this.pending.push(entry); }
      else if (result.status === "retryable" && entry.attempts < this.policy.maxAttempts) { entry.status = "accepted"; this.pending.push(entry); }
      else entry.status = "failed";
    }
  }
  get(receiptId) { return this.records.get(receiptId.toLowerCase()) ?? null; }
  snapshot() {
    return {
      schema: SNAPSHOT_SCHEMA, schemaVersion: SNAPSHOT_VERSION,
      policy: { ...this.policy }, sequence: this.sequence,
      anchorContext: this.anchorContext ? { ...this.anchorContext } : null,
      records: [...this.records.values()].map((entry) => structuredClone(entry)),
      pendingReceiptIds: this.pending.map((entry) => entry.receiptId)
    };
  }
  static fromSnapshot(snapshot) {
    if (!snapshot || snapshot.schema !== SNAPSHOT_SCHEMA || snapshot.schemaVersion !== SNAPSHOT_VERSION ||
      !snapshot.policy || !Number.isInteger(snapshot.sequence) || snapshot.sequence < 0 ||
      !Array.isArray(snapshot.records) || !Array.isArray(snapshot.pendingReceiptIds)) throw new Error("Unsupported or malformed AVR ingress snapshot");
    const queue = new AvrIngressQueue(snapshot.policy);
    queue.sequence = snapshot.sequence;
    if (snapshot.anchorContext !== null && (!snapshot.anchorContext || !Number.isInteger(snapshot.anchorContext.chainId) || typeof snapshot.anchorContext.anchorContract !== "string")) {
      throw new Error("Malformed AVR ingress anchor context");
    }
    queue.anchorContext = snapshot.anchorContext ? { ...snapshot.anchorContext } : null;
    for (const rawEntry of snapshot.records) {
      if (!rawEntry || typeof rawEntry.receiptId !== "string" || !rawEntry.presentation ||
        !Number.isInteger(rawEntry.acceptedAt) || !Number.isInteger(rawEntry.attempts) ||
        typeof rawEntry.status !== "string" || queue.records.has(rawEntry.receiptId.toLowerCase())) throw new Error("Malformed AVR ingress entry");
      validatePresentation(rawEntry.presentation);
      if (rawEntry.presentation.receiptId.toLowerCase() !== rawEntry.receiptId.toLowerCase()) throw new Error("AVR ingress receipt ID does not match presentation");
      queue.records.set(rawEntry.receiptId.toLowerCase(), structuredClone(rawEntry));
    }
    const pending = new Set();
    for (const receiptId of snapshot.pendingReceiptIds) {
      if (typeof receiptId !== "string" || pending.has(receiptId.toLowerCase())) throw new Error("Malformed AVR ingress pending receipt IDs");
      const entry = queue.records.get(receiptId.toLowerCase());
      if (!entry || entry.status !== "accepted") throw new Error("Pending AVR ingress entry is unavailable");
      pending.add(receiptId.toLowerCase()); queue.pending.push(entry);
    }
    return queue;
  }
}
module.exports = { DEFAULT_POLICY, SNAPSHOT_SCHEMA, SNAPSHOT_VERSION, AvrIngressQueue };
