// Development alpha durable AVR event indexer.
// The chain remains the source of truth. This file-backed index is disposable
// derived data and rewinds before advancing whenever a recorded block hash no
// longer matches the connected node.

const fs = require("node:fs");
const path = require("node:path");
const { Interface, concat, keccak256 } = require("ethers");

const INDEX_SCHEMA = "aichain.avr-event-index";
const INDEX_VERSION = "0.1.0-draft";
const MANIFEST_SCHEMA = "aichain.avr-batch-manifest";
const MANIFEST_VERSION = "0.1.0-draft";
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVENT_INTERFACE = new Interface([
  "event ReceiptAnchored(bytes32 indexed receiptId, bytes32 indexed commitmentsRoot, address indexed issuer, string schemaVersion, uint64 includedAt)",
  "event AuthorisedReceiptAnchored(bytes32 indexed receiptId, bytes32 indexed organizationId, bytes32 indexed authorityCommitment, address issuer, bytes32 commitmentsRoot, string schemaVersion, uint64 includedAt)",
  "event ReceiptBatchAnchored(bytes32 indexed batchRoot, address indexed issuer, uint64 leafCount, string schemaVersion, uint64 includedAt)",
  "event ReceiptBatchAnchoredV2(bytes32 indexed batchId, bytes32 indexed batchRoot, address indexed publisher, uint64 leafCount, string schemaVersion, uint64 includedAt)"
]);

function normaliseHex(value, label) {
  if (typeof value !== "string" || !BYTES32.test(value)) throw new Error(`${label} must be bytes32`);
  return value.toLowerCase();
}
function normaliseAddress(value, label) {
  if (typeof value !== "string" || !ADDRESS.test(value)) throw new Error(`${label} must be an address`);
  return value.toLowerCase();
}
function hashPair(left, right) {
  left = normaliseHex(left, "left"); right = normaliseHex(right, "right");
  return left <= right ? keccak256(concat([left, right])) : keccak256(concat([right, left]));
}
function merkleRoot(ids) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("receiptIds must not be empty");
  let level = ids.map((id, index) => normaliseHex(id, `receiptIds[${index}]`));
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) next.push(hashPair(level[index], level[index + 1] ?? level[index]));
    level = next;
  }
  return level[0];
}
function membershipProof(ids, leafIndex) {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= ids.length) throw new Error("leafIndex is outside receiptIds");
  let index = leafIndex;
  let level = ids.map((id, item) => normaliseHex(id, `receiptIds[${item}]`));
  const siblings = [];
  while (level.length > 1) {
    siblings.push(level[index ^ 1] ?? level[index]);
    const next = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) next.push(hashPair(level[cursor], level[cursor + 1] ?? level[cursor]));
    level = next; index = Math.floor(index / 2);
  }
  return siblings;
}

function newState(chainId, startBlock) {
  return { schema: INDEX_SCHEMA, schemaVersion: INDEX_VERSION, chainId, startBlock, nextBlock: startBlock, checkpoints: [], individual: {}, batches: {}, updatedAt: null };
}
function validateState(state) {
  if (!state || state.schema !== INDEX_SCHEMA || state.schemaVersion !== INDEX_VERSION || !Number.isInteger(state.chainId) || !Number.isInteger(state.nextBlock) || state.nextBlock < 0 || !Array.isArray(state.checkpoints) || typeof state.individual !== "object" || typeof state.batches !== "object") throw new Error("Unsupported or malformed AVR index state");
  return state;
}
function readState(file, chainId, startBlock) {
  if (!fs.existsSync(file)) return newState(chainId, startBlock);
  const state = validateState(JSON.parse(fs.readFileSync(file, "utf8")));
  if (state.chainId !== chainId) throw new Error(`Index chainId ${state.chainId} does not match node chainId ${chainId}`);
  return state;
}
function writeState(file, state) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function normaliseContracts(contracts) {
  if (!Array.isArray(contracts) || contracts.length === 0) throw new Error("At least one AVR anchor contract is required");
  const seen = new Set();
  return contracts.map((contract, index) => {
    if (!contract || !["individual", "authorised", "batch"].includes(contract.kind)) throw new Error(`contracts[${index}].kind is invalid`);
    const address = normaliseAddress(contract.address, `contracts[${index}].address`);
    if (seen.has(address)) throw new Error("Anchor contract addresses must be unique");
    seen.add(address); return { kind: contract.kind, address };
  });
}
function parsedEvents(logs, contract) {
  return logs.flatMap((log) => {
    try {
      if (normaliseAddress(log.address, "log.address") !== contract.address) return [];
      const event = EVENT_INTERFACE.parseLog(log);
      const expected = contract.kind === "individual" ? ["ReceiptAnchored"] : contract.kind === "authorised" ? ["AuthorisedReceiptAnchored"] : ["ReceiptBatchAnchored", "ReceiptBatchAnchoredV2"];
      return expected.includes(event.name) ? [{ log, event, contract }] : [];
    } catch { return []; }
  });
}
function applyEvent(state, item) {
  const { args } = item.event;
  const position = { blockNumber: Number(item.log.blockNumber), blockHash: normaliseHex(item.log.blockHash, "log.blockHash"), transactionHash: normaliseHex(item.log.transactionHash, "log.transactionHash"), logIndex: Number(item.log.index ?? item.log.logIndex) };
  if (item.contract.kind === "batch") {
    const v2 = item.event.name === "ReceiptBatchAnchoredV2";
    const batchRoot = normaliseHex(args[v2 ? 1 : 0], "batchRoot");
    const batchId = v2 ? normaliseHex(args[0], "batchId") : null;
    const publisher = normaliseAddress(args[v2 ? 2 : 1], v2 ? "publisher" : "issuer");
    const key = batchId ?? batchRoot;
    state.batches[key] = { ...position, contract: item.contract.address, batchId, batchRoot, publisher, issuer: publisher, leafCount: Number(args[v2 ? 3 : 2]), schemaVersion: args[v2 ? 4 : 3], includedAt: Number(args[v2 ? 5 : 4]), manifest: null };
    return;
  }
  const authorised = item.contract.kind === "authorised";
  const receiptId = normaliseHex(args[0], "receiptId");
  state.individual[receiptId] = {
    ...position, contract: item.contract.address, receiptId,
    commitmentsRoot: normaliseHex(authorised ? args[4] : args[1], "commitmentsRoot"),
    issuer: normaliseAddress(authorised ? args[3] : args[2], "issuer"),
    schemaVersion: authorised ? args[5] : args[3], includedAt: Number(authorised ? args[6] : args[4]),
    organisationId: authorised ? normaliseHex(args[1], "organizationId") : null,
    authorityCommitment: authorised ? normaliseHex(args[2], "authorityCommitment") : null
  };
}
function rewindState(state, fromBlock) {
  for (const collection of [state.individual, state.batches]) {
    for (const [key, entry] of Object.entries(collection)) if (entry.blockNumber >= fromBlock) delete collection[key];
  }
  state.checkpoints = state.checkpoints.filter((checkpoint) => checkpoint.number < fromBlock);
  state.nextBlock = fromBlock;
}
async function rewindForReorg(state, provider) {
  for (const checkpoint of [...state.checkpoints].reverse()) {
    const block = await provider.getBlock(checkpoint.number);
    // Block hashes commit to their complete parent history. Once a newer
    // checkpoint matches, every earlier checkpoint is on that same history.
    if (block && typeof block.hash === "string" && block.hash.toLowerCase() === checkpoint.hash) return false;
    // Entries are keyed by receipt/batch and may have overwritten older
    // anchors. Rebuild from the configured deployment block to restore them
    // correctly after any detected reorganisation.
    state.individual = {};
    state.batches = {};
    state.checkpoints = [];
    state.nextBlock = state.startBlock;
    return true;
  }
  return false;
}

function validateManifest(manifest) {
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA || manifest.schemaVersion !== MANIFEST_VERSION || !Array.isArray(manifest.receiptIds) || !Number.isInteger(manifest.leafCount) || manifest.leafCount !== manifest.receiptIds.length || typeof manifest.anchorSchemaVersion !== "string" || !manifest.anchorSchemaVersion) throw new Error("Unsupported or malformed batch manifest");
  const root = merkleRoot(manifest.receiptIds);
  if (normaliseHex(manifest.batchRoot, "batchRoot") !== root) throw new Error("Batch manifest root does not match receiptIds");
  const batchId = manifest.batchId == null ? null : normaliseHex(manifest.batchId, "batchId");
  const publisher = manifest.publisher == null ? null : normaliseAddress(manifest.publisher, "publisher");
  if ((batchId === null) !== (publisher === null)) throw new Error("V2 batch manifests require both batchId and publisher");
  return { ...manifest, batchId, publisher, batchRoot: root, receiptIds: manifest.receiptIds.map((id, index) => normaliseHex(id, `receiptIds[${index}]`)) };
}
function attachManifest(state, manifest) {
  manifest = validateManifest(manifest);
  const batch = state.batches[manifest.batchId ?? manifest.batchRoot];
  if (!batch) throw new Error("Batch root is not indexed from a canonical anchor event");
  if (batch.batchId && (batch.batchId !== manifest.batchId || batch.publisher !== manifest.publisher)) throw new Error("V2 batch manifest identity does not match anchored batch event");
  if (batch.leafCount !== manifest.leafCount || batch.schemaVersion !== manifest.anchorSchemaVersion) throw new Error("Batch manifest metadata does not match anchored batch event");
  batch.manifest = { receiptIds: manifest.receiptIds, anchorSchemaVersion: manifest.anchorSchemaVersion };
  return batch;
}
function attachManifestsDirectory(state, directory) {
  if (!directory || !fs.existsSync(directory)) return 0;
  let attached = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const parsed = JSON.parse(fs.readFileSync(path.join(directory, entry.name), "utf8"));
    if (parsed?.schema === INDEX_SCHEMA) continue;
    const manifest = validateManifest(parsed);
    // A valid manifest can outlive its orphaned anchor. Keep it off the index.
    if (!state.batches[manifest.batchId ?? manifest.batchRoot]) continue;
    attachManifest(state, manifest);
    attached += 1;
  }
  return attached;
}
function lookupReceipt(state, receiptId) {
  receiptId = normaliseHex(receiptId, "receiptId");
  if (state.individual[receiptId]) return { mode: "individual", anchor: state.individual[receiptId] };
  for (const batch of Object.values(state.batches)) {
    if (!batch.manifest) continue;
    const index = batch.manifest.receiptIds.indexOf(receiptId);
    if (index >= 0) return { mode: "batch", anchor: batch, inclusion: { batchId: batch.batchId, publisher: batch.publisher, batchRoot: batch.batchRoot, leafCount: batch.leafCount, schemaVersion: batch.schemaVersion, siblings: membershipProof(batch.manifest.receiptIds, index) } };
  }
  return null;
}

async function syncIndex({ provider, contracts, statePath, manifestsDirectory = null, startBlock = 0, maxRange = 1_000 }) {
  if (!Number.isInteger(startBlock) || startBlock < 0) throw new Error("startBlock must be a non-negative integer");
  if (!Number.isInteger(maxRange) || maxRange < 1 || maxRange > 1_000) throw new Error("maxRange must be an integer between 1 and 1000 blocks");
  const normalizedContracts = normaliseContracts(contracts);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const state = readState(statePath, chainId, startBlock);
  state.startBlock ??= startBlock;
  const binding = JSON.stringify({contracts: [...normalizedContracts].sort((a,b)=>a.address.localeCompare(b.address)), startBlock});
  if (state.binding) {
    let prior;
    try { prior = JSON.parse(state.binding); } catch { throw new Error('Index configuration binding is malformed; use a fresh index'); }
    if (prior.startBlock !== startBlock || JSON.stringify(prior.contracts) !== JSON.stringify(JSON.parse(binding).contracts)) throw new Error('Index network/contracts configuration changed; use a fresh index');
  }
  if (!state.binding && state.nextBlock !== startBlock) throw new Error('Legacy unbound index must be rebuilt');
  state.binding = binding;
  const reorged = await rewindForReorg(state, provider);
  // Rebuild derived maps: an orphan may have overwritten an older canonical
  // anchor for the same receipt. Alpha favours correctness over rollback speed.
  if (reorged) {
    state.individual = {};
    state.batches = {};
    state.checkpoints = [];
    state.nextBlock = startBlock;
    state.updatedAt = new Date().toISOString();
    writeState(statePath, state);
  }
  const latest = await provider.getBlockNumber();
  let indexedBlocks = 0;
  for (let fromBlock = state.nextBlock; fromBlock <= latest;) {
    const toBlock = Math.min(latest, fromBlock + maxRange - 1);
    const firstBlock = await provider.getBlock(fromBlock);
    const rangeEndBefore = await provider.getBlock(toBlock);
    if (!firstBlock?.hash || !rangeEndBefore?.hash) throw new Error(`Unable to retrieve canonical scan range ${fromBlock}-${toBlock}`);
    for (const contract of normalizedContracts) {
      const logs = await provider.getLogs({ address: contract.address, fromBlock, toBlock });
      for (const item of parsedEvents(logs, contract)) {
        const eventBlockNumber = Number(item.log.blockNumber);
        if (eventBlockNumber < fromBlock || eventBlockNumber > toBlock) throw new Error('RPC returned an event outside the requested index range');
        const eventBlock = await provider.getBlock(eventBlockNumber);
        if (!eventBlock?.hash || eventBlock.hash.toLowerCase() !== item.log.blockHash.toLowerCase()) throw new Error('Chain changed during index scan; retry');
        applyEvent(state, item);
      }
    }
    const rangeEndAfter = await provider.getBlock(toBlock);
    if (!rangeEndAfter?.hash || rangeEndAfter.hash.toLowerCase() !== rangeEndBefore.hash.toLowerCase()) throw new Error('Chain changed during index scan; retry');
    state.checkpoints.push({ fromBlock, toBlock, number: toBlock, hash: normaliseHex(rangeEndAfter.hash, "range end block hash") });
    state.nextBlock = toBlock + 1;
    indexedBlocks += toBlock - fromBlock + 1;
    state.updatedAt = new Date().toISOString();
    writeState(statePath, state);
    fromBlock = toBlock + 1;
  }
  const manifestsAttached = attachManifestsDirectory(state, manifestsDirectory);
  state.updatedAt = new Date().toISOString();
  writeState(statePath, state);
  return { state, reorged, indexedBlocks, manifestsAttached };
}

module.exports = { INDEX_SCHEMA, INDEX_VERSION, MANIFEST_SCHEMA, MANIFEST_VERSION, EVENT_INTERFACE, newState, validateState, createManifest: (receiptIds, anchorSchemaVersion = "0.1.0-draft", v2 = {}) => ({ schema: MANIFEST_SCHEMA, schemaVersion: MANIFEST_VERSION, receiptIds, leafCount: receiptIds.length, batchRoot: merkleRoot(receiptIds), anchorSchemaVersion, ...(v2.batchId ? { batchId: v2.batchId, publisher: v2.publisher } : {}) }), validateManifest, attachManifest, lookupReceipt, syncIndex, rewindForReorg, hashPair, merkleRoot, membershipProof };
