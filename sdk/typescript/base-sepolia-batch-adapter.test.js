const assert = require('node:assert/strict');
const test = require('node:test');
const { BaseSepoliaSyntheticBatchAdapter, BATCH_ABI } = require('./base-sepolia-batch-adapter');
const { createManifest } = require('./avr-event-indexer');

const contract = '0x5781540E4682A9D35011C94A25F615e438E8E7aF';
const publisher = '0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3';
const receipt = `0x${'ab'.repeat(32)}`;

test('prepares an explicit synthetic queue batch for the deployed Base anchor', () => {
  const adapter = new BaseSepoliaSyntheticBatchAdapter({ contract, publisher });
  const prepared = adapter.prepare({ synthetic: true, manifest: createManifest([receipt], '0.4.0-alpha') });
  assert.equal(prepared.status, 'prepared-for-metamask');
  assert.equal(prepared.anchor.chainId, 84532);
  assert.equal(prepared.manifest.publisher, publisher.toLowerCase());
  assert.equal(BATCH_ABI.parseTransaction({ data: prepared.transaction.data }).name, 'anchorBatch');
  assert.equal(BATCH_ABI.parseTransaction({ data: prepared.transaction.data }).args[0], receipt);
});

test('refuses batches that are not explicitly synthetic or use another schema', () => {
  const adapter = new BaseSepoliaSyntheticBatchAdapter({ contract, publisher });
  const manifest = createManifest([receipt], '0.4.0-alpha');
  assert.throws(() => adapter.prepare({ manifest }), /explicitly synthetic/);
  assert.throws(() => adapter.prepare({ synthetic: true, manifest: createManifest([receipt], '0.1.0-draft') }), /schema version/);
});
