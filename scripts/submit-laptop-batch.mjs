#!/usr/bin/env node
// Submit a development-only AVR batch through the laptop's localhost node.
// The keystore password is read only from the ignored .env.laptop-dev file.

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JsonRpcProvider, Wallet, Contract, concat, keccak256 } from "ethers";

const projectRoot = resolve(import.meta.dirname, "..");
const address = (process.argv[2] ?? "").toLowerCase();
const seed = process.argv[3] ?? "laptop-originated-1-20260822";
const receiptCount = Number(process.argv[4] ?? "100");
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const batchAnchor = "0xE680eEb44688898c108FAf2bF8589d108Fe86fE8";
const schemaVersion = "0.1.0-draft";

if (!/^0x[0-9a-f]{40}$/.test(address)) {
  throw new Error("Usage: node scripts/submit-laptop-batch.mjs 0xLaptopAddress [seed] [receiptCount]");
}
if (!Number.isInteger(receiptCount) || receiptCount <= 0) {
  throw new Error("receiptCount must be a positive integer");
}

function sha256Hex(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function merkleRoot(leaves) {
  let level = [...leaves];
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      let left = level[index];
      let right = level[index + 1] ?? left;
      if (right.toLowerCase() < left.toLowerCase()) [left, right] = [right, left];
      next.push(keccak256(concat([left, right])));
    }
    level = next;
  }
  return level[0];
}

const env = await readFile(resolve(projectRoot, ".env.laptop-dev"), "utf8");
const passwordMatch = env.match(/^LAPTOP_DEV_ACCOUNT_PASSWORD=(.+)$/m);
if (!passwordMatch) throw new Error("LAPTOP_DEV_ACCOUNT_PASSWORD is missing from .env.laptop-dev");

const keystoreDirectory = resolve(projectRoot, "devnet", "laptop-node-1", "keystore");
const keystoreName = (await readdir(keystoreDirectory)).find((name) => name.toLowerCase().endsWith(address.slice(2)));
if (!keystoreName) throw new Error(`No local keystore was found for ${address}`);

const wallet = (await Wallet.fromEncryptedJson(
  await readFile(resolve(keystoreDirectory, keystoreName), "utf8"),
  passwordMatch[1],
)).connect(provider);
if (wallet.address.toLowerCase() !== address) throw new Error("Keystore address mismatch");

const receiptIds = Array.from({ length: receiptCount }, (_, index) =>
  sha256Hex(`aichain:benchmark-receipt:${seed}:${index}`),
);
const root = merkleRoot(receiptIds);
const anchor = new Contract(batchAnchor, [
  "function anchorBatch(bytes32 batchRoot,uint64 leafCount,string schemaVersion)",
], wallet);

const transaction = await anchor.anchorBatch(root, receiptCount, schemaVersion);
console.log(`Submitted from laptop: ${transaction.hash}`);
const receipt = await transaction.wait();
const report = {
  schema: "aichain.laptop-originated-batch-report",
  schemaVersion,
  scope: "development-only laptop-originated submission through localhost RPC",
  sender: wallet.address,
  batchAnchor,
  seed,
  receiptCount,
  batchRoot: root,
  transactionHash: transaction.hash,
  blockNumber: receipt.blockNumber,
  status: receipt.status,
};
const reportPath = resolve(projectRoot, "devnet", "laptop-originated-batch-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Confirmed in block: ${receipt.blockNumber}`);
console.log(`Report written to: ${reportPath}`);
