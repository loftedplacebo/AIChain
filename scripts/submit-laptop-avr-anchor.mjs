#!/usr/bin/env node
// Anchor one draft AVR through the laptop's localhost node.
// The encrypted key and its password remain in ignored local files.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { prepareAnchor } = require("../sdk/typescript/receipt.js");
const projectRoot = resolve(import.meta.dirname, "..");
const receiptPath = resolve(projectRoot, process.argv[2] ?? "");
const address = (process.argv[3] ?? "").toLowerCase();
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const anchorAddress = "0xd2997572F0Ec774B7ae8e936ae440D66a15B8372";

if (!/^0x[0-9a-f]{40}$/.test(address) || !process.argv[2]) {
  throw new Error("Usage: node scripts/submit-laptop-avr-anchor.mjs receipt.json 0xLaptopAddress");
}

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const prepared = prepareAnchor(receipt);
if (prepared.claimedIssuer?.toLowerCase() !== address) {
  throw new Error("The receipt's claimed issuer must match the local signing account for this development example");
}

const env = await readFile(resolve(projectRoot, ".env.laptop-dev"), "utf8");
const passwordMatch = env.match(/^LAPTOP_DEV_ACCOUNT_PASSWORD=(.+)$/m);
if (!passwordMatch) throw new Error("LAPTOP_DEV_ACCOUNT_PASSWORD is missing from .env.laptop-dev");
const keystoreDirectory = resolve(projectRoot, "devnet", "laptop-node-1", "keystore");
const keystoreName = (await readdir(keystoreDirectory)).find((name) => name.toLowerCase().endsWith(address.slice(2)));
if (!keystoreName) throw new Error(`No local keystore was found for ${address}`);
const wallet = (await Wallet.fromEncryptedJson(
  await readFile(resolve(keystoreDirectory, keystoreName), "utf8"), passwordMatch[1],
)).connect(provider);

const anchor = new Contract(anchorAddress, [
  "function anchorReceipt(bytes32 receiptId,bytes32 commitmentsRoot,string schemaVersion)",
], wallet);
const transaction = await anchor.anchorReceipt(prepared.receiptId, prepared.commitmentsRoot, prepared.schemaVersion);
console.log(`Submitted AVR from laptop: ${transaction.hash}`);
const confirmed = await transaction.wait();
const report = {
  schema: "aichain.laptop-avr-anchor-report",
  schemaVersion: prepared.schemaVersion,
  scope: "development-only laptop-originated individual AVR anchor",
  sender: wallet.address,
  anchorAddress,
  receiptPath: process.argv[2],
  ...prepared,
  transactionHash: transaction.hash,
  blockNumber: confirmed.blockNumber,
  status: confirmed.status,
};
const reportPath = resolve(projectRoot, "devnet", "laptop-avr-anchor-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Confirmed in block: ${confirmed.blockNumber}`);
console.log(`Report written to: ${reportPath}`);
