const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EVENT_INTERFACE, createManifest, lookupReceipt, syncIndex } = require("./avr-event-indexer");

const individualContract = "0x1000000000000000000000000000000000000001";
const batchContract = "0x2000000000000000000000000000000000000002";
const issuer = "0x3000000000000000000000000000000000000003";
const receiptA = `0x${"aa".repeat(32)}`;
const receiptB = `0x${"bb".repeat(32)}`;
const receiptC = `0x${"cc".repeat(32)}`;
const root = (value) => `0x${value.repeat(64)}`;

function log(name, values, address, blockNumber, blockHash, transactionHash, logIndex = 0) {
  const encoded = EVENT_INTERFACE.encodeEventLog(EVENT_INTERFACE.getEvent(name), values);
  return { address, topics: encoded.topics, data: encoded.data, blockNumber, blockHash, transactionHash, index: logIndex };
}
function mockProvider(chain) {
  return {
    getNetwork: async () => ({ chainId: 424242n }),
    getBlockNumber: async () => Math.max(...Object.keys(chain.blocks).map(Number)),
    getBlock: async (number) => chain.blocks[number] ?? null,
    getLogs: async ({ address, fromBlock }) => (chain.logs[fromBlock] ?? []).filter((entry) => entry.address.toLowerCase() === address.toLowerCase())
  };
}
function tempState() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "aichain-index-")), "state.json"); }
const contracts = [{ kind: "individual", address: individualContract }, { kind: "batch", address: batchContract }];

test("persists cursor/checkpoints and indexes canonical individual anchor events", async () => {
  const chain = {
    blocks: { 0: { hash: root("0") }, 1: { hash: root("1") } },
    logs: { 0: [], 1: [log("ReceiptAnchored", [receiptA, root("a"), issuer, "0.1.0-draft", 10], individualContract, 1, root("1"), root("d"))] }
  };
  const statePath = tempState();
  const first = await syncIndex({ provider: mockProvider(chain), contracts, statePath });
  assert.equal(first.indexedBlocks, 2);
  assert.equal(first.state.nextBlock, 2);
  assert.equal(lookupReceipt(first.state, receiptA).anchor.commitmentsRoot, root("a"));

  const second = await syncIndex({ provider: mockProvider(chain), contracts, statePath });
  assert.equal(second.indexedBlocks, 0);
  assert.equal(second.reorged, false);
});

test("rolls back orphaned events when a stored block hash is replaced", async () => {
  const chain = {
    blocks: { 0: { hash: root("0") }, 1: { hash: root("1") } },
    logs: { 0: [], 1: [log("ReceiptAnchored", [receiptA, root("a"), issuer, "0.1.0-draft", 10], individualContract, 1, root("1"), root("d"))] }
  };
  const statePath = tempState();
  await syncIndex({ provider: mockProvider(chain), contracts, statePath });
  chain.blocks[1] = { hash: root("2") };
  chain.logs[1] = [log("ReceiptAnchored", [receiptB, root("b"), issuer, "0.1.0-draft", 11], individualContract, 1, root("2"), root("e"))];
  const result = await syncIndex({ provider: mockProvider(chain), contracts, statePath });
  assert.equal(result.reorged, true);
  assert.equal(lookupReceipt(result.state, receiptA), null);
  assert.equal(lookupReceipt(result.state, receiptB).anchor.blockHash, root("2"));
});

test("attaches a validated batch manifest and produces receipt inclusion retrieval", async () => {
  const manifest = createManifest([receiptA, receiptB, receiptC], "0.1.0-draft");
  const chain = {
    blocks: { 0: { hash: root("0") }, 1: { hash: root("1") } },
    logs: { 0: [], 1: [log("ReceiptBatchAnchored", [manifest.batchRoot, issuer, 3, "0.1.0-draft", 12], batchContract, 1, root("1"), root("f"))] }
  };
  const statePath = tempState();
  const manifestDirectory = path.dirname(statePath);
  fs.writeFileSync(path.join(manifestDirectory, "batch.json"), JSON.stringify(manifest));
  const result = await syncIndex({ provider: mockProvider(chain), contracts, statePath, manifestsDirectory: manifestDirectory });
  const indexed = lookupReceipt(result.state, receiptB);
  assert.equal(result.manifestsAttached, 1);
  assert.equal(indexed.mode, "batch");
  assert.equal(indexed.inclusion.batchRoot, manifest.batchRoot);
  assert.equal(indexed.inclusion.siblings.length, 2);
});

test("rejects a manifest whose contents do not resolve to the advertised root", async () => {
  const manifest = createManifest([receiptA, receiptB]);
  manifest.batchRoot = root("f");
  const chain = { blocks: { 0: { hash: root("0") } }, logs: { 0: [] } };
  const statePath = tempState();
  const manifestsDirectory = path.dirname(statePath);
  fs.writeFileSync(path.join(manifestsDirectory, "bad.json"), JSON.stringify(manifest));
  await assert.rejects(syncIndex({ provider: mockProvider(chain), contracts, statePath, manifestsDirectory }), /root does not match/);
});
