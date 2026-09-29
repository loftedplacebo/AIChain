const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CONTRACT, DEPLOYMENT_TX, DEFAULT_RPCS, parseArgs, resolveStartBlock, acquireLock } = require("./base-sepolia-avr-indexer.cjs");

test("requires an explicit state path and limits Base log windows", () => {
  assert.throws(() => parseArgs([]), /--state/);
  assert.throws(() => parseArgs(["--state", "state.json", "--range", "1001"]), /between 1 and 1000/);
  assert.throws(() => parseArgs(["--state", "state.json", "--watch-seconds", "2"]), /at least 5/);
  const config = parseArgs(["--state", "state.json", "--manifests-dir", "manifests"]);
  assert.equal(config.startBlock, null);
  assert.deepEqual(config.rpcUrls, DEFAULT_RPCS);
});

test("discovers the indexing start block from the verified anchor deployment receipt", async () => {
  const result = await resolveStartBlock({ getTransactionReceipt: async (hash) => {
    assert.equal(hash, DEPLOYMENT_TX);
    return { status: 1, contractAddress: CONTRACT, blockNumber: 47_000_123 };
  } }, null);
  assert.equal(result, 47_000_123);
  await assert.rejects(resolveStartBlock({ getTransactionReceipt: async () => null }, null), /Could not verify/);
  assert.equal(await resolveStartBlock({}, 123), 123);
});

test("uses an exclusive lock and releases it when the index worker stops", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aichain-base-indexer-"));
  const statePath = path.join(directory, "state.json");
  const release = acquireLock(statePath);
  assert.throws(() => acquireLock(statePath), /lock already exists/);
  release();
  const releaseAgain = acquireLock(statePath);
  releaseAgain();
});
