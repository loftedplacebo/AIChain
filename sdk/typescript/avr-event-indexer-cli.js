// One bounded sync of the local development AVR event index.
const { JsonRpcProvider } = require("ethers");
const fs = require("node:fs");
const { syncIndex } = require("./avr-event-indexer");

function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function isLoopbackUrl(value) {
  try { return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname); } catch { return false; }
}

async function main() {
  if (process.env.AICHAIN_ENABLE_AVR_INDEXER !== "1") throw new Error("Refusing to run: set AICHAIN_ENABLE_AVR_INDEXER=1 explicitly");
  const args = process.argv.slice(2);
  const rpc = option(args, "--ethereum-rpc") ?? "http://127.0.0.1:8545";
  const statePath = option(args, "--state");
  const contractsPath = option(args, "--contracts");
  const contractSpecs = args.flatMap((value, index) => value === "--contract" ? [args[index + 1]] : []).filter(Boolean);
  const manifestsDirectory = option(args, "--manifests-dir") ?? null;
  const startBlock = Number(option(args, "--start-block") ?? 0);
  if (!isLoopbackUrl(rpc)) throw new Error("ethereum-rpc must be a loopback URL");
  if (!statePath || (!contractsPath && contractSpecs.length === 0)) throw new Error("Usage: avr-event-indexer-cli.js --state <state.json> (--contracts <contracts.json> | --contract <individual|authorised|batch:address>) [--manifests-dir <dir>] [--ethereum-rpc <loopback-url>] [--start-block <n>]");
  const contracts = contractsPath ? JSON.parse(fs.readFileSync(contractsPath, "utf8")) : contractSpecs.map((specification) => {
    const [kind, address] = specification.split(":");
    return { kind, address };
  });
  const result = await syncIndex({ provider: new JsonRpcProvider(rpc), contracts, statePath, manifestsDirectory, startBlock });
  console.log(JSON.stringify({ reorged: result.reorged, indexedBlocks: result.indexedBlocks, manifestsAttached: result.manifestsAttached, nextBlock: result.state.nextBlock }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { isLoopbackUrl };
