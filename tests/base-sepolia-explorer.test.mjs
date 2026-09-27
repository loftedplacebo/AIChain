import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_CONTRACT,
  BATCH_V2_TOPIC,
  decodeBatchEventForTest,
  getRecentAnchors,
  rpcRequestWithFallback,
  verifyAnchorTransaction
} from "../lib/base-sepolia-explorer.js";

const txHash = `0x${"a".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;
const batchId = `0x${"c".repeat(64)}`;
const batchRoot = `0x${"d".repeat(64)}`;
const publisher = "0xec502b5f4d1925138a7409d9a7b55fba20e13cc3";
const issuerTopic = `0x${publisher.slice(2).padStart(64, "0")}`;

function word(value) { return BigInt(value).toString(16).padStart(64, "0"); }
function batchLog(overrides = {}) {
  const schema = Buffer.from("0.4.0-alpha", "utf8").toString("hex");
  const schemaPadded = schema.padEnd(Math.ceil(schema.length / 64) * 64, "0");
  const data = `0x${word(1)}${word(96)}${word(1_758_472_900)}${word(schema.length / 2)}${schemaPadded}`;
  return {
    address: BASE_SEPOLIA_CONTRACT.toLowerCase(),
    topics: [BATCH_V2_TOPIC, batchId, batchRoot, issuerTopic],
    data,
    transactionHash: txHash,
    blockNumber: "0x2d06f38",
    blockHash,
    transactionIndex: "0x1",
    logIndex: "0x0",
    ...overrides
  };
}

function providerFor({ latest = "0x2d06f50", chainId = "0x14a34", receipt = undefined, canonicalHash = blockHash } = {}) {
  return async (method, params) => {
    if (method === "eth_chainId") return chainId;
    if (method === "eth_getTransactionReceipt") return receipt === undefined ? {
      transactionHash: txHash,
      from: publisher,
      status: "0x1",
      blockNumber: "0x2d06f38",
      blockHash,
      logs: [batchLog()]
    } : receipt;
    if (method === "eth_getBlockByNumber") return { number: params[0], hash: canonicalHash };
    if (method === "eth_blockNumber") return latest;
    if (method === "eth_getLogs") return [batchLog()];
    throw new Error(`Unexpected RPC method ${method}`);
  };
}

test("decodes the publisher-scoped V2 event and dynamic schema string", () => {
  const result = decodeBatchEventForTest(batchLog());
  assert.equal(result.batchId, batchId);
  assert.equal(result.batchRoot, batchRoot);
  assert.equal(result.publisher, publisher);
  assert.equal(result.leafCount, 1);
  assert.equal(result.schemaVersion, "0.4.0-alpha");
  assert.equal(result.includedAt, 1_758_472_900);
  assert.equal(result.blockNumber, 47_214_392);
});

test("rejects malformed event data instead of rendering a partial anchor", () => {
  assert.throws(() => decodeBatchEventForTest(batchLog({ data: "0x01" })), /Malformed batch event data/);
  assert.equal(decodeBatchEventForTest(batchLog({ address: "0x0000000000000000000000000000000000000001" })), null);
});

test("verifies a successful receipt, matching event and canonical block", async () => {
  const result = await verifyAnchorTransaction(txHash, providerFor());
  assert.equal(result.verified, true);
  assert.equal(result.status, "canonical-inclusion");
  assert.equal(result.chainId, BASE_SEPOLIA_CHAIN_ID);
  assert.equal(result.confirmations, 25);
  assert.equal(result.batchRoot, batchRoot);
  assert.match(result.proofScope, /membership requires the matching batch manifest/);
});

test("fails closed for wrong network and non-canonical receipt blocks", async () => {
  await assert.rejects(verifyAnchorTransaction(txHash, providerFor({ chainId: "0x2105" })), /Base Sepolia/);
  const result = await verifyAnchorTransaction(txHash, providerFor({ canonicalHash: `0x${"e".repeat(64)}` }));
  assert.equal(result.verified, false);
  assert.equal(result.status, "non-canonical");
});

test("reports absent transactions and rejects malformed hashes", async () => {
  const missing = await verifyAnchorTransaction(txHash, providerFor({ receipt: null }));
  assert.equal(missing.status, "not-found");
  await assert.rejects(verifyAnchorTransaction("0x1234", providerFor()), /32-byte transaction hash/);
});

test("lists a small, recent, contract-filtered event window", async () => {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (method === "eth_chainId") return "0x14a34";
    if (method === "eth_blockNumber") return "0x2d06f50";
    if (method === "eth_getLogs") return [batchLog()];
    throw new Error(`Unexpected RPC method ${method}`);
  };
  const result = await getRecentAnchors(rpc);
  assert.equal(result.chainId, BASE_SEPOLIA_CHAIN_ID);
  assert.equal(result.anchors.length, 1);
  assert.equal(result.anchors[0].transactionHash, txHash);
  const filter = calls.find((entry) => entry.method === "eth_getLogs").params[0];
  assert.equal(filter.address, BASE_SEPOLIA_CONTRACT);
  assert.equal(filter.topics[0], BATCH_V2_TOPIC);
  assert.equal(result.scannedBlocks, 1_000);
});

test("falls back to the next configured Base Sepolia RPC when the primary times out", async () => {
  const seen = [];
  const result = await rpcRequestWithFallback("eth_chainId", [], {
    urls: ["https://primary.example/rpc", "https://fallback.example/rpc"],
    fetchImpl: async (url) => {
      seen.push(new URL(url).host);
      if (seen.length === 1) throw new Error("simulated timeout");
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x14a34" });
    },
    timeoutMs: 10
  });
  assert.equal(result, "0x14a34");
  assert.deepEqual(seen, ["primary.example", "fallback.example"]);
});

test("reports all RPC failures with a clear bounded error", async () => {
  await assert.rejects(rpcRequestWithFallback("eth_blockNumber", [], {
    urls: ["https://primary.example/rpc", "https://fallback.example/rpc"],
    fetchImpl: async () => { throw new Error("simulated timeout"); },
    timeoutMs: 10
  }), /All Base Sepolia RPC endpoints failed.*primary\.example.*fallback\.example/);
});
