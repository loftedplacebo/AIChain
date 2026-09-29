#!/usr/bin/env node
// Read-only deployment preparation: compiles locally and prints the exact
// contract-creation transaction data for MetaMask review. It never signs or broadcasts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { keccak256 } = require('ethers');

const root = path.resolve(__dirname, '..');
const artifactFile = path.join(root, 'build', 'base-sepolia', 'ReceiptBatchAnchor.json');
if (!fs.existsSync(artifactFile)) throw new Error('Compile first: node scripts/compile-base-sepolia-anchor.cjs');
const artifact = JSON.parse(fs.readFileSync(artifactFile, 'utf8'));
const manifest = {
  network: { name: 'Base Sepolia', chainId: 84532, rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
  signer: '0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3',
  contract: { name: artifact.contractName, source: artifact.sourceName, compiler: artifact.compiler, evmVersion: artifact.evmVersion, optimizer: artifact.optimizer },
  creation: { to: null, value: '0x0', data: artifact.bytecode, dataBytes: (artifact.bytecode.length - 2) / 2, dataKeccak256: keccak256(artifact.bytecode), sourceArtifactSha256: crypto.createHash('sha256').update(fs.readFileSync(artifactFile)).digest('hex') },
  status: 'prepared-only: no signature, transaction, deployed address, or public contract verification exists yet',
};
const manifestFile = path.join(root, 'build', 'base-sepolia', 'deployment-manifest.json');
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifestFile, network: manifest.network, signer: manifest.signer, creationDataBytes: manifest.creation.dataBytes, creationDataKeccak256: manifest.creation.dataKeccak256, status: manifest.status }, null, 2));
