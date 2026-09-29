// Prepares synthetic AVR batch commitments for the deployed Base Sepolia anchor.
// This adapter intentionally has no signer or broadcast capability: MetaMask (or a
// future reviewed relayer) must make the final submission decision.
const { AbiCoder, Interface, getAddress, keccak256 } = require('ethers');
const { validateManifest } = require('./avr-event-indexer');

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BATCH_ABI = new Interface(['function anchorBatch(bytes32 batchRoot, uint64 leafCount, string schemaVersion)']);
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

function baseBatchId(contract, publisher, batchRoot) {
  return keccak256(AbiCoder.defaultAbiCoder().encode(['uint256', 'address', 'address', 'bytes32'], [BASE_SEPOLIA_CHAIN_ID, contract, publisher, batchRoot]));
}

class BaseSepoliaSyntheticBatchAdapter {
  constructor({ contract, publisher, schemaVersion = '0.4.0-alpha' }) {
    this.contract = getAddress(contract);
    this.publisher = getAddress(publisher);
    if (typeof schemaVersion !== 'string' || !schemaVersion) throw new Error('schemaVersion is required');
    this.schemaVersion = schemaVersion;
  }

  prepare(batch) {
    if (!batch || batch.synthetic !== true) throw new Error('Base Sepolia alpha adapter accepts explicitly synthetic batches only');
    const manifest = validateManifest(batch.manifest);
    if (manifest.anchorSchemaVersion !== this.schemaVersion) throw new Error('Batch schema version does not match Base adapter policy');
    if (!BYTES32.test(manifest.batchRoot) || manifest.leafCount < 1) throw new Error('Batch manifest is not anchorable');
    const batchId = baseBatchId(this.contract, this.publisher, manifest.batchRoot);
    return {
      status: 'prepared-for-metamask',
      synthetic: true,
      manifest: { ...manifest, batchId, publisher: this.publisher.toLowerCase() },
      anchor: { chainId: BASE_SEPOLIA_CHAIN_ID, contract: this.contract.toLowerCase(), publisher: this.publisher.toLowerCase(), batchId, batchRoot: manifest.batchRoot, leafCount: manifest.leafCount, schemaVersion: manifest.anchorSchemaVersion },
      transaction: { to: this.contract, value: '0x0', data: BATCH_ABI.encodeFunctionData('anchorBatch', [manifest.batchRoot, manifest.leafCount, manifest.anchorSchemaVersion]) }
    };
  }
}

module.exports = { BASE_SEPOLIA_CHAIN_ID, BATCH_ABI, baseBatchId, BaseSepoliaSyntheticBatchAdapter };
