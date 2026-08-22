#!/usr/bin/env node
// Development-only OVL checkpoint anchor through the laptop's localhost node.
// Password material remains in ignored .env.laptop-dev and is never logged.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const projectRoot = resolve(import.meta.dirname, "..");
const [checkpointPath, address] = process.argv.slice(2);
const batchAnchor = "0xE680eEb44688898c108FAf2bF8589d108Fe86fE8";
if (!checkpointPath || !/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) {
  throw new Error("Usage: node scripts/submit-laptop-ovl-checkpoint.mjs checkpoint.json 0xLaptopAddress");
}
const parsed = JSON.parse(await readFile(checkpointPath, "utf8"));
const checkpoint = parsed.checkpoint ?? parsed;
if (checkpoint.schema !== "aichain.ovl-checkpoint" || checkpoint.schemaVersion !== "0.1.0-draft") {
  throw new Error("Unsupported OVL checkpoint schema");
}
const env = await readFile(resolve(projectRoot, ".env.laptop-dev"), "utf8");
const password = env.match(/^LAPTOP_DEV_ACCOUNT_PASSWORD=(.+)$/m)?.[1];
if (!password) throw new Error("LAPTOP_DEV_ACCOUNT_PASSWORD is missing from .env.laptop-dev");
const normalizedAddress = address.toLowerCase();
const keystoreDirectory = resolve(projectRoot, "devnet", "laptop-node-1", "keystore");
const keystoreName = (await readdir(keystoreDirectory)).find((name) => name.toLowerCase().endsWith(normalizedAddress.slice(2)));
if (!keystoreName) throw new Error(`No local keystore was found for ${address}`);
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const wallet = (await Wallet.fromEncryptedJson(await readFile(resolve(keystoreDirectory, keystoreName), "utf8"), password)).connect(provider);
if (wallet.address.toLowerCase() !== normalizedAddress) throw new Error("Keystore address mismatch");
const anchor = new Contract(batchAnchor, ["function anchorBatch(bytes32 batchRoot,uint64 leafCount,string schemaVersion)"], wallet);
const transaction = await anchor.anchorBatch(checkpoint.receiptRoot, checkpoint.leafCount, checkpoint.schemaVersion);
console.log(`Submitted checkpoint: ${transaction.hash}`);
const receipt = await transaction.wait();
const report = { schema: "aichain.ovl-anchor-report", schemaVersion: "0.1.0-draft", scope: "development-only", batchAnchor, sender: wallet.address, checkpointRoot: checkpoint.receiptRoot, leafCount: checkpoint.leafCount, transactionHash: transaction.hash, blockNumber: receipt.blockNumber, status: receipt.status };
const reportPath = resolve(projectRoot, "devnet", "laptop-ovl-anchor-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Confirmed in block: ${receipt.blockNumber}`);
console.log(`Report written to: ${reportPath}`);

