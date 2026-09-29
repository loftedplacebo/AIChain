#!/usr/bin/env node
// Prepares, but never signs or broadcasts, one deterministic synthetic V2 batch anchor.
const fs = require('node:fs');
const path = require('node:path');
const { AbiCoder, Interface, getAddress, keccak256, toUtf8Bytes } = require('ethers');

const root = path.resolve(__dirname, '..');
const contract = getAddress('0x5781540E4682A9D35011C94A25F615e438E8E7aF');
const publisher = getAddress('0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3');
const receiptId = keccak256(toUtf8Bytes('aichain:base-sepolia:synthetic-receipt:2026-09-21'));
const batchRoot = receiptId; // one leaf: the Merkle root is the leaf itself
const leafCount = 1;
const schemaVersion = '0.4.0-alpha';
const batchId = keccak256(AbiCoder.defaultAbiCoder().encode(['uint256', 'address', 'address', 'bytes32'], [84532, contract, publisher, batchRoot]));
const abi = new Interface(['function anchorBatch(bytes32 batchRoot, uint64 leafCount, string schemaVersion)']);
const manifest = {
  network: { name: 'Base Sepolia', chainId: 84532 },
  contract, publisher, receiptId, batchRoot, batchId, leafCount, schemaVersion,
  receiptIds: [receiptId],
  schema: 'aichain.avr-batch-manifest', schemaVersion: '0.1.0-draft', anchorSchemaVersion: schemaVersion,
  transaction: { to: contract, value: '0x0', data: abi.encodeFunctionData('anchorBatch', [batchRoot, leafCount, schemaVersion]) },
  status: 'prepared-only: MetaMask must review and sign this synthetic test transaction'
};
const output = path.join(root, 'build', 'base-sepolia', 'synthetic-anchor-manifest.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
const manifestsDirectory = path.join(root, 'build', 'base-sepolia', 'synthetic-manifests');
fs.mkdirSync(manifestsDirectory, { recursive: true });
fs.writeFileSync(path.join(manifestsDirectory, 'synthetic-batch.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, contract, publisher, receiptId, batchRoot, batchId, calldataBytes: (manifest.transaction.data.length - 2) / 2 }, null, 2));
