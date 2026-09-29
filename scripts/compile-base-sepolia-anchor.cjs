#!/usr/bin/env node
// Compiles the public batch anchor into a local, ignored build artifact.
// This does not use a wallet, connect to a chain, or broadcast anything.
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');

const root = path.resolve(__dirname, '..');
const sourceName = 'contracts/avr-anchor/src/ReceiptBatchAnchor.sol';
const source = fs.readFileSync(path.join(root, sourceName), 'utf8');
const input = {
  language: 'Solidity',
  sources: { [sourceName]: { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter(item => item.severity === 'error');
for (const item of output.errors || []) console.error(item.formattedMessage);
if (errors.length) process.exit(1);
const artifact = output.contracts[sourceName].ReceiptBatchAnchor;
if (!artifact.evm.bytecode.object) throw new Error('Compilation did not produce deployment bytecode');
const result = {
  contractName: 'ReceiptBatchAnchor',
  compiler: solc.version(),
  sourceName,
  optimizer: input.settings.optimizer,
  evmVersion: input.settings.evmVersion,
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
  metadata: artifact.metadata,
};
const outputFile = path.join(root, 'build', 'base-sepolia', 'ReceiptBatchAnchor.json');
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputFile, compiler: result.compiler, bytecodeBytes: artifact.evm.bytecode.object.length / 2, deployedBytecodeBytes: artifact.evm.deployedBytecode.object.length / 2 }, null, 2));
