#!/usr/bin/env node
// Submit a 0.2.0-draft authorised receipt through the laptop's localhost development node.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import receiptModule from "../sdk/typescript/authorised-receipt.js";

const { prepareAuthorisedAnchor } = receiptModule;
const projectRoot = resolve(import.meta.dirname, "..");
const [receiptPath, address, contractAddress] = process.argv.slice(2);
if (!receiptPath || !/^0x[0-9a-fA-F]{40}$/.test(address ?? "") || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress ?? "")) {
  throw new Error("Usage: node scripts/submit-laptop-authorised-avr.mjs receipt.json 0xLaptopAddress 0xAuthorisedAVRAnchor");
}
const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const prepared = prepareAuthorisedAnchor(receipt);
if (prepared.issuer.toLowerCase() !== address.toLowerCase()) throw new Error("Receipt issuer must equal the laptop signing address");
const env = await readFile(resolve(projectRoot, ".env.laptop-dev"), "utf8");
const password = env.match(/^LAPTOP_DEV_ACCOUNT_PASSWORD=(.+)$/m)?.[1];
if (!password) throw new Error("LAPTOP_DEV_ACCOUNT_PASSWORD is missing from .env.laptop-dev");
const directory = resolve(projectRoot, "devnet", "laptop-node-1", "keystore");
const name = (await readdir(directory)).find((value) => value.toLowerCase().endsWith(address.slice(2).toLowerCase()));
if (!name) throw new Error(`No laptop keystore was found for ${address}`);
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const wallet = (await Wallet.fromEncryptedJson(await readFile(resolve(directory, name), "utf8"), password)).connect(provider);
const anchor = new Contract(contractAddress, ["function anchorAuthorisedReceipt(bytes32,bytes32,bytes32,bytes32,string)"], wallet);
const transaction = await anchor.anchorAuthorisedReceipt(prepared.receiptId, prepared.commitmentsRoot, prepared.organizationId, prepared.authorityCommitment, prepared.schemaVersion);
console.log(`Submitted authorised receipt: ${transaction.hash}`);
const confirmation = await transaction.wait();
const report = { schema: "aichain.authorised-avr-anchor-report", schemaVersion: prepared.schemaVersion, scope: "development-only", contractAddress, sender: wallet.address, receiptId: prepared.receiptId, commitmentsRoot: prepared.commitmentsRoot, organizationId: prepared.organizationId, authorityCommitment: prepared.authorityCommitment, transactionHash: transaction.hash, blockNumber: confirmation.blockNumber, status: confirmation.status };
const reportPath = resolve(projectRoot, "devnet", "laptop-authorised-avr-anchor-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Confirmed in block: ${confirmation.blockNumber}`);
console.log(`Report written to: ${reportPath}`);

