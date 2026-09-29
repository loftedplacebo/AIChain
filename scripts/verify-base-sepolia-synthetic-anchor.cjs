#!/usr/bin/env node
// Read-only validation of the synthetic V2 event and the durable AVR index path.
const fs = require('node:fs');
const path = require('node:path');
const { AbiCoder, Interface, JsonRpcProvider, getAddress, keccak256 } = require('ethers');
const { syncIndex, lookupReceipt } = require('../sdk/typescript/avr-event-indexer');

const transactionHash = process.argv[2];
if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash || '')) throw new Error('Usage: node scripts/verify-base-sepolia-synthetic-anchor.cjs <transaction-hash>');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build', 'base-sepolia', 'synthetic-anchor-manifest.json'), 'utf8'));
const provider = new JsonRpcProvider('https://sepolia.base.org');
const events = new Interface(['event ReceiptBatchAnchoredV2(bytes32 indexed batchId, bytes32 indexed batchRoot, address indexed publisher, uint64 leafCount, string schemaVersion, uint64 includedAt)']);
async function retryRead(operation, attempts = 4) {
  let failure;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); } catch (error) {
      failure = error;
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw failure;
}

(async () => {
  const [network, transaction, receipt] = await Promise.all([provider.getNetwork(), provider.getTransaction(transactionHash), provider.getTransactionReceipt(transactionHash)]);
  if (network.chainId !== 84532n || !transaction || !receipt || receipt.status !== 1) throw new Error('Transaction is not a successful Base Sepolia receipt');
  const event = receipt.logs.filter(log => log.address.toLowerCase() === manifest.contract.toLowerCase()).map(log => { try { return events.parseLog(log); } catch { return null; } }).find(Boolean);
  if (!event) throw new Error('ReceiptBatchAnchoredV2 was not emitted');
  const publisher = getAddress(event.args[2]);
  const batchId = keccak256(AbiCoder.defaultAbiCoder().encode(['uint256', 'address', 'address', 'bytes32'], [84532, manifest.contract, publisher, manifest.batchRoot]));
  const matches = event.args[0].toLowerCase() === batchId.toLowerCase()
    && event.args[1].toLowerCase() === manifest.batchRoot.toLowerCase()
    && Number(event.args[3]) === manifest.leafCount
    && event.args[4] === manifest.anchorSchemaVersion;
  if (!matches) throw new Error('V2 event does not match the prepared synthetic manifest');
  const manifestsDirectory = path.join(root, 'build', 'base-sepolia', 'synthetic-manifests');
  fs.writeFileSync(path.join(manifestsDirectory, 'observed-synthetic-batch.json'), `${JSON.stringify({ ...manifest, publisher, batchId }, null, 2)}\n`);
  // Index the confirmed event block only. A full historical catch-up belongs to
  // the long-running index worker, not this bounded verification command.
  const indexProvider = { getNetwork: (...args) => provider.getNetwork(...args), getBlock: (...args) => retryRead(() => provider.getBlock(...args)), getBlockNumber: async () => receipt.blockNumber, getLogs: args => retryRead(() => provider.getLogs(args)) };
  const statePath = path.join(root, 'build', 'base-sepolia', 'synthetic-anchor-index-single-block.json');
  fs.rmSync(statePath, { force: true });
  const indexed = await syncIndex({ provider: indexProvider, contracts: [{ kind: 'batch', address: manifest.contract }], statePath, manifestsDirectory, startBlock: receipt.blockNumber });
  const found = lookupReceipt(indexed.state, manifest.receiptId);
  if (!found || found.mode !== 'batch' || found.inclusion.batchId !== batchId.toLowerCase()) throw new Error('SDK indexer did not resolve the synthetic receipt to its V2 batch');
  console.log(JSON.stringify({ status: 'verified-read-only', transactionHash, wrapperTransactionTo: transaction.to, directContractCall: transaction.to?.toLowerCase() === manifest.contract.toLowerCase(), contract: manifest.contract, blockNumber: receipt.blockNumber, event: event.name, batchId, batchRoot: manifest.batchRoot, publisher, publisherMatchesRequestedFluxora: publisher.toLowerCase() === manifest.publisher.toLowerCase(), indexedReceipt: found }, null, 2));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
