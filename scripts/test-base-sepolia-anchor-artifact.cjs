#!/usr/bin/env node
// Local ABI and bytecode regression checks. No chain connection, signing or broadcast.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Interface, getAddress, keccak256, toUtf8Bytes } = require('ethers');
const artifactFile = path.resolve(__dirname, '..', 'build', 'base-sepolia', 'ReceiptBatchAnchor.json');
const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
const abi = new Interface(artifact.abi);
const root = keccak256(toUtf8Bytes('orvessian-base-sepolia-artifact-test'));
const publisher = getAddress('0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3');
const anchor = abi.encodeFunctionData('anchorBatch', [root, 1000, '0.4.0-alpha']);
const identity = abi.encodeFunctionData('batchId', [publisher, root]);
assert.equal(abi.parseTransaction({ data: anchor }).name, 'anchorBatch');
assert.deepEqual(Array.from(abi.parseTransaction({ data: anchor }).args.slice(0, 3)), [root, 1000n, '0.4.0-alpha']);
assert.equal(abi.parseTransaction({ data: identity }).name, 'batchId');
assert(artifact.bytecode.startsWith('0x') && artifact.bytecode.length > 2);
assert(abi.getEvent('ReceiptBatchAnchoredV2').inputs.some(input => input.name === 'batchId' && input.indexed));
console.log(JSON.stringify({ status: 'pass', root, publisher, anchorCalldataBytes: (anchor.length - 2) / 2, batchIdCalldataBytes: (identity.length - 2) / 2 }, null, 2));
