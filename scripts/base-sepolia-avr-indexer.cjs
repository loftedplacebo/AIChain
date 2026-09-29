#!/usr/bin/env node
// Read-only, persistent Base Sepolia batch-event indexer.
// Explicitly opt-in with AICHAIN_ENABLE_AVR_INDEXER=1. The index is derived
// state; Base Sepolia remains authoritative.
const fs = require("node:fs");
const path = require("node:path");
const { JsonRpcProvider } = require("ethers");
const { syncIndex } = require("../sdk/typescript/avr-event-indexer");

const CHAIN_ID = 84532n;
const CONTRACT = "0x5781540E4682A9D35011C94A25F615e438E8E7aF";
const DEPLOYMENT_TX = "0x15f60cf6440038de5ebfdeb7becf9fdeb4b4a21b00825ce47ed8af22ae476e06";
const DEFAULT_RPCS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"];

function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function repeatedOption(args, name) { return args.flatMap((value, index) => value === name ? [args[index + 1]] : []).filter(Boolean); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function parseArgs(args) {
  const statePath = option(args, "--state");
  if (!statePath) throw new Error("--state <path> is required");
  const rpcUrls = repeatedOption(args, "--rpc-url");
  const watchSeconds = Number(option(args, "--watch-seconds") ?? 0);
  const maxRange = Number(option(args, "--range") ?? 1_000);
  const startBlockOption = option(args, "--start-block");
  if (startBlockOption !== undefined && (!/^\d+$/.test(startBlockOption) || !Number.isSafeInteger(Number(startBlockOption)))) throw new Error("--start-block must be a non-negative safe integer");
  if (!Number.isInteger(watchSeconds) || (watchSeconds !== 0 && watchSeconds < 5)) throw new Error("--watch-seconds must be 0 (one scan) or at least 5");
  if (!Number.isInteger(maxRange) || maxRange < 1 || maxRange > 1_000) throw new Error("--range must be between 1 and 1000 blocks");
  return {
    statePath: path.resolve(statePath),
    manifestsDirectory: option(args, "--manifests-dir") ? path.resolve(option(args, "--manifests-dir")) : null,
    rpcUrls: rpcUrls.length ? rpcUrls : DEFAULT_RPCS,
    startBlock: startBlockOption === undefined ? null : Number(startBlockOption),
    watchSeconds,
    maxRange
  };
}

async function createFailoverProvider(rpcUrls) {
  const candidates = rpcUrls.map((url) => {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("Base Sepolia RPC URLs must use HTTPS and contain no embedded credentials");
    return { url: endpoint.href, provider: new JsonRpcProvider(endpoint.href, Number(CHAIN_ID), { staticNetwork: true }) };
  });
  if (candidates.length < 1 || candidates.length > 3) throw new Error("Configure between one and three RPC endpoints");
  const healthy = [];
  const failures = [];
  for (const candidate of candidates) {
    try {
      const chainId = BigInt(await candidate.provider.send("eth_chainId", []));
      if (chainId !== CHAIN_ID) throw new Error(`endpoint returned chain ${chainId}`);
      const code = await candidate.provider.getCode(CONTRACT);
      if (code === "0x" || code === "0x0") throw new Error("anchor contract has no deployed bytecode");
      healthy.push(candidate);
    } catch (error) {
      failures.push(`${new URL(candidate.url).host}: ${error instanceof Error ? error.message : "unavailable"}`);
    }
  }
  if (healthy.length === 0) throw new Error(`No healthy Base Sepolia RPC endpoint. ${failures.join("; ")}`);

  async function call(method, args) {
    const errors = [];
    for (const candidate of healthy) {
      try { return await candidate.provider[method](...args); }
      catch (error) { errors.push(`${new URL(candidate.url).host}: ${error instanceof Error ? error.message : "request failed"}`); }
    }
    throw new Error(`All Base Sepolia RPCs failed during ${method}. ${errors.join("; ")}`);
  }
  const provider = {
    getNetwork: async () => ({ chainId: CHAIN_ID }),
    getBlockNumber: () => call("getBlockNumber", []),
    getBlock: (number) => call("getBlock", [number]),
    getLogs: (filter) => call("getLogs", [filter]),
    getTransactionReceipt: (hash) => call("getTransactionReceipt", [hash])
  };
  return { provider, healthy: healthy.map(({ url }) => url), failures };
}

async function resolveStartBlock(provider, override) {
  if (override !== null) return override;
  const receipt = await provider.getTransactionReceipt(DEPLOYMENT_TX);
  if (!receipt || receipt.status !== 1 || receipt.contractAddress?.toLowerCase() !== CONTRACT.toLowerCase()) {
    throw new Error("Could not verify the known Base Sepolia anchor deployment; supply --start-block only if you intend to index a partial history");
  }
  const startBlock = Number(BigInt(receipt.blockNumber));
  if (!Number.isSafeInteger(startBlock)) throw new Error("Deployment block exceeds the safe integer range");
  return startBlock;
}

function acquireLock(statePath) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const lockPath = `${statePath}.lock`;
  let descriptor;
  try { descriptor = fs.openSync(lockPath, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Indexer lock already exists at ${lockPath}; confirm no indexer is running before removing a stale lock`);
    throw error;
  }
  fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return () => { try { fs.closeSync(descriptor); } finally { fs.rmSync(lockPath, { force: true }); } };
}

async function main() {
  if (process.env.AICHAIN_ENABLE_AVR_INDEXER !== "1") throw new Error("Refusing to run: set AICHAIN_ENABLE_AVR_INDEXER=1 explicitly");
  const args = process.argv.slice(2);
  const config = parseArgs(args);
  const { provider, healthy, failures } = await createFailoverProvider(config.rpcUrls);
  const startBlock = await resolveStartBlock(provider, config.startBlock);
  const releaseLock = acquireLock(config.statePath);
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stopping = true; });
  let retryMs = 5_000;
  try {
    console.log(JSON.stringify({ status: "started", chainId: Number(CHAIN_ID), contract: CONTRACT, startBlock, statePath: config.statePath, rpcEndpoints: healthy.map((url) => new URL(url).host), unavailableEndpoints: failures }, null, 2));
    while (!stopping) {
      try {
        const result = await syncIndex({ provider, contracts: [{ kind: "batch", address: CONTRACT }], statePath: config.statePath, manifestsDirectory: config.manifestsDirectory, startBlock, maxRange: config.maxRange });
        retryMs = 5_000;
        console.log(JSON.stringify({ status: "synced", at: new Date().toISOString(), reorged: result.reorged, indexedBlocks: result.indexedBlocks, manifestsAttached: result.manifestsAttached, nextBlock: result.state.nextBlock, latestIndexedBlock: result.state.nextBlock - 1, checkpointCount: result.state.checkpoints.length }));
        if (config.watchSeconds === 0 || stopping) break;
        await delay(config.watchSeconds * 1_000);
      } catch (error) {
        console.error(JSON.stringify({ status: "retrying", at: new Date().toISOString(), retryInMs: retryMs, error: error instanceof Error ? error.message : String(error) }));
        if (config.watchSeconds === 0) throw error;
        await delay(retryMs);
        retryMs = Math.min(retryMs * 2, 60_000);
      }
    }
  } finally { releaseLock(); }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { CONTRACT, DEPLOYMENT_TX, DEFAULT_RPCS, parseArgs, createFailoverProvider, resolveStartBlock, acquireLock };
