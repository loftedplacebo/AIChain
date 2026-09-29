#!/usr/bin/env node
// Sends two controlled fixtures to the local synthetic-only API and prepares a
// batch. It never contacts a wallet or broadcasts.
const fs = require('node:fs'); const path = require('node:path');
const { createPresentation } = require('../sdk/typescript/avr-presentation');
const baseReceipt = require('../fixtures/avr/receipt-v0.1.0-draft.json');
const root = path.resolve(__dirname, '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env.synthetic-ingress'), 'utf8').split(/\r?\n/).filter(Boolean).map(line => line.split(/=(.*)/s).slice(0, 2)));
const url = `http://127.0.0.1:${env.AICHAIN_SYNTHETIC_INGRESS_PORT || 8787}`;
const headers = { 'content-type': 'application/json', 'x-aichain-api-key': env.AICHAIN_SYNTHETIC_API_KEY };
function fixture(value) { const receipt = structuredClone(baseReceipt); receipt.commitments.input = `0x${value.toString(16).padStart(64, '0')}`; return createPresentation(receipt, { level: 'commitment-only' }); }
async function post(endpoint, body) { const response = await fetch(`${url}${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(`${endpoint}: ${data.status || response.status}`); return data; }
(async () => {
  const first = await post('/v1/synthetic/receipts', { synthetic: true, presentation: fixture(0x3001) });
  const second = await post('/v1/synthetic/receipts', { synthetic: true, presentation: fixture(0x3002) });
  const prepared = await post('/v1/synthetic/batches/prepare', { force: true });
  const output = { scope: 'closed synthetic Base Sepolia test cycle', preparedAt: new Date().toISOString(), firstReceiptId: first.receiptId, secondReceiptId: second.receiptId, ...prepared };
  const file = path.join(root, 'build', 'base-sepolia', 'first-closed-cycle-prepared.json'); fs.writeFileSync(file, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ status: prepared.status, queueBatchId: prepared.queueBatchId, receiptCount: prepared.receiptIds.length, transaction: prepared.transaction, file }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
