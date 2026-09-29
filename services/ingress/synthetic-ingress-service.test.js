const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const test = require('node:test');
const { SyntheticIngressService } = require('./synthetic-ingress-service');
const { BaseSepoliaSyntheticBatchAdapter } = require('../../sdk/typescript/base-sepolia-batch-adapter');
const { createPresentation } = require('../../sdk/typescript/avr-presentation');
const base = require('../../fixtures/avr/receipt-v0.1.0-draft.json');
const key = 'development-test-key-1234';
function fixture(seed) { const receipt = structuredClone(base); receipt.commitments.input = `0x${seed.toString(16).padStart(64, '0')}`; return createPresentation(receipt, { level: 'commitment-only' }); }
function service() { return new SyntheticIngressService({ apiKey: key, stateFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aichain-ingress-')), 'queue.json'), adapter: new BaseSepoliaSyntheticBatchAdapter({ contract: '0x5781540E4682A9D35011C94A25F615e438E8E7aF', publisher: '0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3' }), queuePolicy: { maxBatchReceipts: 2, microBatchMs: 100 } }); }
test('authenticates, persists synthetic submissions, and prepares a Base batch without broadcasting', () => {
  const ingress = service(), one = fixture(1), two = fixture(2);
  assert.equal(ingress.submit({ apiKey: 'wrong', synthetic: true, presentation: one }).status, 'unauthorized');
  assert.equal(ingress.submit({ apiKey: key, synthetic: false, presentation: one }).status, 'rejected-non-synthetic');
  assert.equal(ingress.submit({ apiKey: key, synthetic: true, presentation: one, now: 0 }).accepted, true);
  assert.equal(ingress.submit({ apiKey: key, synthetic: true, presentation: two, now: 1 }).accepted, true);
  const prepared = ingress.prepareNext({ apiKey: key, now: 2 });
  assert.equal(prepared.status, 'prepared-for-metamask'); assert.equal(prepared.transaction.value, '0x0'); assert.equal(prepared.receiptIds.length, 2);
  assert.equal(ingress.reconcile({ apiKey:key, queueBatchId:prepared.queueBatchId, result:{status:'included',anchor:{transactionHash:`0x${'11'.repeat(32)}`}} }).status,'recorded');
  assert.equal(ingress.health().metrics.included,1);
});
test('journals every accepted receipt and replays entries after the last checkpoint', () => {
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aichain-ingress-journal-')), 'queue.json');
  const adapter = new BaseSepoliaSyntheticBatchAdapter({ contract: '0x5781540E4682A9D35011C94A25F615e438E8E7aF', publisher: '0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3' });
  const first = new SyntheticIngressService({ apiKey: key, stateFile, adapter, checkpointEveryReceipts: 2, queuePolicy: { maxBatchReceipts: 5 } });
  for (let seed = 20; seed < 23; seed += 1) assert.equal(first.submit({ apiKey: key, synthetic: true, presentation: fixture(seed), now: seed }).accepted, true);
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).journalSequence, 2);
  assert.equal(fs.readFileSync(`${stateFile}.journal.ndjson`, 'utf8').trim().split(/\r?\n/).length, 1);
  const resumed = new SyntheticIngressService({ apiKey: key, stateFile, adapter, checkpointEveryReceipts: 2, queuePolicy: { maxBatchReceipts: 5 } });
  assert.equal(resumed.health().queued, 3);
  assert.equal(resumed.prepareNext({ apiKey: key, force: true }).receiptIds.length, 3);
  assert.equal(fs.readFileSync(`${stateFile}.journal.ndjson`, 'utf8'), '');
});
