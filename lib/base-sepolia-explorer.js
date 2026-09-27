export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CONTRACT = "0x5781540E4682A9D35011C94A25F615e438E8E7aF";
export const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
export const BASE_SEPOLIA_FALLBACK_RPC_URL = "https://base-sepolia-rpc.publicnode.com";
export const BASESCAN_TX_URL = "https://sepolia.basescan.org/tx/";
export const BATCH_V2_TOPIC = "0x44574d4084f7d534ab2ec531347a6ccde98ac63971dedcf997a0a0ab6a17dadd";
export const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
// Project-owned synthetic Base Sepolia anchors. These are live-checked on every
// overview refresh until a durable, complete event index replaces this list.
export const REFERENCE_ANCHOR_TRANSACTIONS = [
  "0xb23a4e1b9c4c1eed80e3cf4d27b2c21e00f0baaf09e8d1a9447a567caf1851bd",
  "0xa3cb60f6ce88c43b0ba51281db6a426d27076b033fe0c662145c4b79aa58b17b",
  "0x94bcbd0157424d75c779cc508e17a5ee443e494405b3d9c03b5927f1faf46613",
  "0x6f076aa185b9a57903b4ddce3c665f7069c29f32a48bb885df54ece31f7dade9",
  "0xc1505ee94e698d6a1ddd50e665f2d1099c7803aa1ef77cb87a85db21fc99aeea"
];

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_WORD_PATTERN = /^[0-9a-fA-F]{64}$/;
const MAX_LOG_WINDOW = 1_000;
const MAX_RECENT_EVENTS = 12;

function quantity(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`RPC returned an invalid ${label}`);
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`RPC ${label} exceeds the safe display range`);
  return Number(parsed);
}

function bytes32(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Invalid ${label}`);
  return value.toLowerCase();
}

function decodeBatchV2Log(log) {
  if (typeof log?.address !== "string" || log.address.toLowerCase() !== BASE_SEPOLIA_CONTRACT.toLowerCase()) return null;
  if (!Array.isArray(log.topics) || log.topics.length !== 4 || log.topics[0]?.toLowerCase() !== BATCH_V2_TOPIC) return null;
  const batchId = bytes32(log.topics[1], "batch ID");
  const batchRoot = bytes32(log.topics[2], "batch root");
  const publisherTopic = bytes32(log.topics[3], "publisher topic");
  if (!/^0{24}/.test(publisherTopic.slice(2))) throw new Error("Invalid indexed publisher address");
  const publisher = `0x${publisherTopic.slice(-40)}`;
  if (typeof log.data !== "string" || !log.data.startsWith("0x") || log.data.length < 2 + 64 * 4) throw new Error("Malformed batch event data");
  const data = log.data.slice(2);
  if (!/^[0-9a-fA-F]+$/.test(data) || data.length % 64 !== 0) throw new Error("Malformed batch event data");
  const word = (index) => {
    const start = index * 64;
    const value = data.slice(start, start + 64);
    if (!HEX_WORD_PATTERN.test(value)) throw new Error("Batch event is missing a data word");
    return BigInt(`0x${value}`);
  };
  const leafCountBig = word(0);
  const stringOffset = word(1);
  const includedAtBig = word(2);
  if (leafCountBig < 1n || leafCountBig > BigInt(Number.MAX_SAFE_INTEGER) || includedAtBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Batch event contains an out-of-range integer");
  }
  if (stringOffset % 32n !== 0n || stringOffset > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Invalid schema string offset");
  const stringWord = Number(stringOffset / 32n);
  const stringLengthBig = word(stringWord);
  if (stringLengthBig > 128n || stringLengthBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Batch schema version is too long");
  const stringLength = Number(stringLengthBig);
  const start = (stringWord + 1) * 64;
  const end = start + stringLength * 2;
  if (end > data.length) throw new Error("Batch schema string exceeds event data");
  const schemaBytes = new Uint8Array(stringLength);
  for (let index = 0; index < stringLength; index += 1) schemaBytes[index] = Number.parseInt(data.slice(start + index * 2, start + index * 2 + 2), 16);
  const schemaVersion = new TextDecoder("utf-8", { fatal: true }).decode(schemaBytes);
  if (!schemaVersion || [...schemaVersion].some((character) => character.charCodeAt(0) < 32)) throw new Error("Invalid batch schema version");
  return {
    batchId,
    batchRoot,
    publisher,
    leafCount: Number(leafCountBig),
    schemaVersion,
    includedAt: Number(includedAtBig),
    transactionHash: bytes32(log.transactionHash, "transaction hash"),
    blockNumber: quantity(log.blockNumber, "log block number"),
    blockHash: bytes32(log.blockHash, "log block hash"),
    transactionIndex: quantity(log.transactionIndex, "transaction index"),
    logIndex: quantity(log.logIndex, "log index"),
    contract: BASE_SEPOLIA_CONTRACT
  };
}

export async function rpcRequest(method, params = [], { url = BASE_SEPOLIA_RPC_URL, fetchImpl = fetch, timeoutMs = 3_000 } = {}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") {
    throw new Error("Base Sepolia RPC URL must use HTTPS");
  }
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`Base RPC returned HTTP ${response.status} without a JSON response`); }
  if (body?.error) throw new Error(`Base RPC error: ${String(body.error.message ?? "request failed").slice(0, 180)}`);
  if (!response.ok) throw new Error(`Base RPC returned HTTP ${response.status}`);
  if (!("result" in (body ?? {}))) throw new Error("Base RPC returned no result");
  return body.result;
}

export async function rpcRequestWithFallback(method, params = [], { urls = [BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_FALLBACK_RPC_URL], fetchImpl = fetch, timeoutMs = 3_000 } = {}) {
  const endpoints = [...new Set(urls.filter((url) => typeof url === "string" && url.trim()).map((url) => url.trim()))];
  if (endpoints.length === 0 || endpoints.length > 3) throw new Error("Configure one to three Base Sepolia RPC endpoints");
  const failures = [];
  for (const url of endpoints) {
    let host = "invalid endpoint";
    try { host = new URL(url).host; } catch { failures.push(`${host}: invalid URL`); continue; }
    try {
      const result = await rpcRequest(method, params, { url, fetchImpl, timeoutMs });
      if (method === "eth_chainId" && BigInt(result) !== BigInt(BASE_SEPOLIA_CHAIN_ID)) throw new Error("endpoint is not Base Sepolia");
      return result;
    } catch (error) { failures.push(`${host}: ${error instanceof Error ? error.message : "request failed"}`); }
  }
  throw new Error(`All Base Sepolia RPC endpoints failed. ${failures.join("; ")}`);
}

async function requireBaseSepolia(rpc) {
  const chainId = quantity(await rpc("eth_chainId", []), "chain ID");
  if (chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error(`Configured RPC is chain ${chainId}; Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}) is required`);
  return chainId;
}

export async function getRecentAnchors(rpc = rpcRequest) {
  const chainId = await requireBaseSepolia(rpc);
  const latestBlock = quantity(await rpc("eth_blockNumber", []), "latest block");
  const fromBlock = Math.max(0, latestBlock - MAX_LOG_WINDOW + 1);
  const logs = await rpc("eth_getLogs", [{
    address: BASE_SEPOLIA_CONTRACT,
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: "latest",
    topics: [BATCH_V2_TOPIC]
  }]);
  if (!Array.isArray(logs)) throw new Error("Base RPC returned an invalid event list");
  const anchors = logs.map(decodeBatchV2Log).filter(Boolean)
    .sort((left, right) => right.blockNumber - left.blockNumber || right.logIndex - left.logIndex)
    .slice(0, MAX_RECENT_EVENTS);
  return { network: "Base Sepolia", chainId, latestBlock, fromBlock, scannedBlocks: latestBlock - fromBlock + 1, anchors };
}

export async function getReferenceAnchors(rpc = rpcRequest) {
  const checks = await Promise.all(REFERENCE_ANCHOR_TRANSACTIONS.map(async (transactionHash) => {
    try { return await verifyAnchorTransaction(transactionHash, rpc); }
    catch (error) { return { verified: false, status: "rpc-unavailable", transactionHash, message: error instanceof Error ? error.message : "RPC read failed" }; }
  }));
  return {
    anchors: checks.filter((item) => item.verified).sort((left, right) => left.leafCount - right.leafCount),
    unavailable: checks.filter((item) => !item.verified).length
  };
}

export async function verifyAnchorTransaction(transactionHash, rpc = rpcRequest) {
  if (typeof transactionHash !== "string" || !TX_HASH_PATTERN.test(transactionHash)) throw new Error("Enter a 32-byte transaction hash");
  const requestedHash = transactionHash.toLowerCase();
  const chainId = await requireBaseSepolia(rpc);
  const receipt = await rpc("eth_getTransactionReceipt", [requestedHash]);
  if (!receipt) return { verified: false, status: "not-found", message: "No transaction receipt was found on Base Sepolia." };
  if (typeof receipt.transactionHash !== "string" || receipt.transactionHash.toLowerCase() !== requestedHash) {
    return { verified: false, status: "invalid", message: "The RPC receipt hash does not match the requested transaction." };
  }
  if (!ADDRESS_PATTERN.test(receipt.from ?? "")) return { verified: false, status: "invalid", message: "The transaction receipt has no valid sender address." };
  if (receipt.status !== "0x1" && receipt.status !== "0x01") {
    return { verified: false, status: "failed", message: "The transaction did not succeed." };
  }
  const anchor = (receipt.logs ?? []).map(decodeBatchV2Log).find((entry) => entry?.transactionHash === requestedHash);
  if (!anchor) return { verified: false, status: "not-an-anchor", message: "The successful transaction did not emit a ReceiptBatchAnchoredV2 event from the Orvessian anchor contract." };
  const blockNumber = quantity(receipt.blockNumber, "receipt block number");
  const receiptBlockHash = bytes32(receipt.blockHash, "receipt block hash");
  if (anchor.blockNumber !== blockNumber || anchor.blockHash !== receiptBlockHash) {
    return { verified: false, status: "invalid", message: "The anchor event position does not match the transaction receipt." };
  }
  const block = await rpc("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
  if (!block?.hash || bytes32(block.hash, "canonical block hash") !== receiptBlockHash) {
    return { verified: false, status: "non-canonical", message: "The receipt block hash does not match the current canonical block." };
  }
  const latestBlock = quantity(await rpc("eth_blockNumber", []), "latest block");
  if (latestBlock < blockNumber) return { verified: false, status: "invalid", message: "The receipt block is above the reported chain head." };
  return {
    verified: true,
    status: "canonical-inclusion",
    network: "Base Sepolia",
    chainId,
    latestBlock,
    confirmations: latestBlock - blockNumber + 1,
    transactionHash: requestedHash,
    transactionFrom: receipt.from.toLowerCase(),
    blockHash: receiptBlockHash,
    ...anchor,
    proofScope: "The transaction, canonical block and publisher-scoped batch event are verified. Per-receipt Merkle membership requires the matching batch manifest and proof."
  };
}

export function decodeBatchEventForTest(log) {
  return decodeBatchV2Log(log);
}
