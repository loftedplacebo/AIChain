#!/usr/bin/env node
// Read-only live regression: confirms the known synthetic Base event remains
// resolvable through the same V2 verifier/indexer path. It never sends a tx.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const transactionHash = '0xb23a4e1b9c4c1eed80e3cf4d27b2c21e00f0baaf09e8d1a9447a567caf1851bd';
const result = spawnSync(process.execPath, ['scripts/verify-base-sepolia-synthetic-anchor.cjs', transactionHash], { cwd: root, encoding: 'utf8' });
if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status || 1); }
const verified = JSON.parse(result.stdout);
if (verified.event !== 'ReceiptBatchAnchoredV2' || verified.indexedReceipt?.mode !== 'batch' || verified.publisherMatchesRequestedFluxora !== true) throw new Error('Synthetic Base ingress live regression did not meet expected assertions');
console.log(JSON.stringify({ status: 'pass', scope: 'read-only live Base Sepolia synthetic ingress regression', transactionHash, blockNumber: verified.blockNumber, batchId: verified.batchId }, null, 2));
