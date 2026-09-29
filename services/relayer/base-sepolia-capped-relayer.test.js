const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const test = require('node:test');
const { BaseSepoliaCappedRelayer } = require('./base-sepolia-capped-relayer');
const { BaseSepoliaSyntheticBatchAdapter } = require('../../sdk/typescript/base-sepolia-batch-adapter');
const { createManifest } = require('../../sdk/typescript/avr-event-indexer');

const contract = '0x5781540E4682A9D35011C94A25F615e438E8E7aF'; const publisher = '0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3';
const adapter = new BaseSepoliaSyntheticBatchAdapter({ contract, publisher });
function prepared(count = 2) { const receiptIds = Array.from({ length: count }, (_, index) => `0x${(index + 1).toString(16).padStart(64, '0')}`); const manifest = { ...createManifest(receiptIds), anchorSchemaVersion: adapter.schemaVersion }; return { ...adapter.prepare({ synthetic: true, manifest }), manifest: { ...manifest, receiptIds } }; }
function harness(options = {}) { const calls = []; const provider = { getNetwork: async () => ({ chainId: 84532n }), estimateGas: async () => 200_000n, getFeeData: async () => ({ gasPrice: 5_000_000n }) }; const signer = { getAddress: async () => publisher, sendTransaction: async tx => { calls.push(tx); return { hash: `0x${'ab'.repeat(32)}` }; } }; const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aichain-relayer-')), 'budget.json'); const relayer = new BaseSepoliaCappedRelayer({ provider, signer, publisher, contract, stateFile, policy: { paused: false, ...options.policy }, clock: options.clock ?? (() => Date.UTC(2026, 8, 22, 12)) }); return { relayer, provider, signer, calls, stateFile }; }

test('dry-run reports a capped quote and sends no transaction', async () => { const { relayer, calls } = harness(); const result = await relayer.submit(prepared(), { dryRun: true }); assert.equal(result.status, 'dry-run'); assert.equal(result.quote.leafCount, 2); assert.equal(calls.length, 0); });
test('fails closed for paused relayer, wrong publisher, oversized batch and expensive fee', async () => {
  const paused = harness({ policy: { paused: true } }); await assert.rejects(paused.relayer.submit(prepared()), /paused/);
  const wrong = harness(); const badPrepared = prepared(); badPrepared.anchor.publisher = '0x0000000000000000000000000000000000000001'; await assert.rejects(wrong.relayer.submit(badPrepared), /publisher/);
  const size = harness({ policy: { maxBatchReceipts: 1 } }); await assert.rejects(size.relayer.submit(prepared(2)), /batch size/);
  const fee = harness({ policy: { maxGasPriceWei: '1000' } }); await assert.rejects(fee.relayer.submit(prepared()), /gas price/);
});
test('reserves daily spend and applies transaction rate cap before broadcast', async () => {
  const { relayer, stateFile, calls } = harness({ policy: { maxTransactionsPerHour: 1, maxDailySpendWei: '1000000000000000000' } });
  assert.equal((await relayer.submit(prepared(), { dryRun: false })).status, 'submitted');
  await assert.rejects(relayer.submit(prepared(3), { dryRun: false }), /hourly transaction rate/);
  assert.equal(calls.length, 1); assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).reservations.length, 1);
});
test('refuses malformed and nonzero-value transactions', async () => {
  const { relayer } = harness(); const nonzero = prepared(); nonzero.transaction.value = '0x1'; await assert.rejects(relayer.submit(nonzero), /transaction does not match/);
  const malformed = prepared(); malformed.transaction.data = '0x'; await assert.rejects(relayer.submit(malformed), /transaction does not match/);
});
