// Durable development ingress boundary. It deliberately accepts only labelled
// synthetic fixtures and returns prepared transactions; it cannot sign or send.
const fs = require('node:fs');
const path = require('node:path');
const { AvrIngressQueue } = require('../../sdk/typescript/avr-ingress-queue');

function writeSnapshot(file, queue) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(queue.snapshot(), null, 2)}\n`);
  fs.renameSync(temporary, file);
}
function writeJson(file, value) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); const temporary = `${file}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(temporary, file); }
function appendJsonLine(file, value) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(value)}\n`); }
function readJournal(file) { if (!fs.existsSync(file)) return []; return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => { try { return JSON.parse(line); } catch { throw new Error(`Malformed ingress journal line ${index + 1}`); } }); }

class SyntheticIngressService {
  constructor({ apiKey, stateFile, adapter, queuePolicy = {}, checkpointEveryReceipts = 100 }) {
    if (typeof apiKey !== 'string' || apiKey.length < 16) throw new Error('A development API key of at least 16 characters is required');
    if (!stateFile || !adapter) throw new Error('stateFile and adapter are required');
    if (!Number.isInteger(checkpointEveryReceipts) || checkpointEveryReceipts < 1) throw new Error('checkpointEveryReceipts must be a positive integer');
    this.apiKey = apiKey; this.stateFile = stateFile; this.adapter = adapter; this.checkpointEveryReceipts = checkpointEveryReceipts;
    const snapshot = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    this.queue = snapshot ? AvrIngressQueue.fromSnapshot(snapshot) : new AvrIngressQueue(queuePolicy);
    this.journalFile = `${stateFile}.journal.ndjson`; this.checkpointSequence = Number(snapshot?.journalSequence ?? 0); this.journalSequence = this.checkpointSequence;
    if (!Number.isInteger(this.checkpointSequence) || this.checkpointSequence < 0) throw new Error('Malformed ingress journal checkpoint');
    for (const event of readJournal(this.journalFile)) {
      if (!event || event.type !== 'accepted-submission' || !Number.isInteger(event.sequence) || event.sequence < 1 || !Number.isInteger(event.acceptedAt) || !event.presentation) throw new Error('Malformed ingress journal event');
      this.journalSequence = Math.max(this.journalSequence, event.sequence);
      if (event.sequence <= this.checkpointSequence) continue;
      const replayed = this.queue.submit(event.presentation, event.acceptedAt);
      if (!replayed.accepted) throw new Error(`Ingress journal replay failed at sequence ${event.sequence}: ${replayed.status}`);
    }
    this.preparedFile = `${stateFile}.prepared-batches.json`;
    this.prepared = fs.existsSync(this.preparedFile) ? JSON.parse(fs.readFileSync(this.preparedFile, 'utf8')) : {};
    this.metricsFile = `${stateFile}.metrics.json`;
    this.metrics = fs.existsSync(this.metricsFile) ? JSON.parse(fs.readFileSync(this.metricsFile, 'utf8')) : { startedAt: new Date().toISOString(), accepted: 0, rejected: 0, prepared: 0, included: 0, failed: 0 };
  }
  saveMetrics() { writeJson(this.metricsFile, this.metrics); }
  checkpointQueue() { writeJson(this.stateFile, { ...this.queue.snapshot(), journalSequence: this.journalSequence }); this.checkpointSequence = this.journalSequence; fs.writeFileSync(this.journalFile, ''); }
  authorize(apiKey) { return typeof apiKey === 'string' && apiKey === this.apiKey; }
  submit({ apiKey, synthetic, presentation, now = Date.now() }) {
    if (!this.authorize(apiKey)) { this.metrics.rejected += 1; this.saveMetrics(); return { accepted: false, status: 'unauthorized' }; }
    if (synthetic !== true) { this.metrics.rejected += 1; this.saveMetrics(); return { accepted: false, status: 'rejected-non-synthetic' }; }
    const result = this.queue.submit(presentation, now);
    if (result.accepted) { this.journalSequence += 1; appendJsonLine(this.journalFile, { type: 'accepted-submission', sequence: this.journalSequence, acceptedAt: now, presentation }); this.metrics.accepted += 1; if (this.journalSequence - this.checkpointSequence >= this.checkpointEveryReceipts) this.checkpointQueue(); } else this.metrics.rejected += 1;
    this.saveMetrics();
    return result;
  }
  prepareNext({ apiKey, now = Date.now(), force = false }) {
    if (!this.authorize(apiKey)) return { status: 'unauthorized' };
    const batch = this.queue.drain(now, force);
    if (!batch) return { status: 'empty-or-waiting' };
    // The receipt format and the settlement schema evolve independently. This
    // environment binds every prepared batch to the reviewed Base alpha schema.
    batch.manifest.anchorSchemaVersion = this.adapter.schemaVersion;
    const prepared = this.adapter.prepare({ ...batch, synthetic: true });
    this.prepared[batch.batchId] = { queueBatchId: batch.batchId, receiptIds: batch.receiptIds, manifest: prepared.manifest, anchor: prepared.anchor, transaction: prepared.transaction, status: 'prepared', preparedAt: new Date(now).toISOString() };
    this.metrics.prepared += 1; writeJson(this.preparedFile, this.prepared); this.saveMetrics();
    this.checkpointQueue();
    return { ...prepared, queueBatchId: batch.batchId, receiptIds: batch.receiptIds };
  }
  recordAnchorResult({ apiKey, batch, result }) {
    if (!this.authorize(apiKey)) return { status: 'unauthorized' };
    this.queue.recordAnchorResult(batch, result); this.checkpointQueue();
    return { status: 'recorded' };
  }
  reconcile({ apiKey, queueBatchId, result }) {
    if (!this.authorize(apiKey)) return { status: 'unauthorized' };
    const prepared = this.prepared[queueBatchId]; if (!prepared) return { status: 'unknown-batch' };
    this.queue.recordAnchorResult({ batchId: queueBatchId, receiptIds: prepared.receiptIds }, result);
    prepared.status = result.status; prepared.result = result; prepared.reconciledAt = new Date().toISOString();
    if (result.status === 'included') this.metrics.included += 1; else if (result.status === 'failed') this.metrics.failed += 1;
    this.saveMetrics();
    this.checkpointQueue(); writeJson(this.preparedFile, this.prepared);
    return { status: 'recorded', queueBatchId };
  }
  health() { return { status: 'ok', mode: 'synthetic-only', queued: this.queue.pending.length, retained: this.queue.records.size, prepared: Object.values(this.prepared).filter(batch => batch.status === 'prepared').length, metrics: { ...this.metrics } }; }
}
module.exports = { SyntheticIngressService, writeSnapshot };
