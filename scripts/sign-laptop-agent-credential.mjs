#!/usr/bin/env node
// Development-only local signing helper. It reads the ignored laptop password and never writes it to output.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Wallet, getBytes } from "ethers";
import credentialModule from "../sdk/typescript/agent-credential.js";

const { deriveAgentCredential } = credentialModule;
const projectRoot = resolve(import.meta.dirname, "..");
const [credentialPath, outputPath, address] = process.argv.slice(2);
if (!credentialPath || !outputPath || !/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) {
  throw new Error("Usage: node scripts/sign-laptop-agent-credential.mjs credential.json output.json 0xLaptopAddress");
}
const credential = JSON.parse(await readFile(credentialPath, "utf8"));
if (credential.issuer.toLowerCase() !== address.toLowerCase()) throw new Error("Credential issuer must equal signing address in this prototype");
const env = await readFile(resolve(projectRoot, ".env.laptop-dev"), "utf8");
const password = env.match(/^LAPTOP_DEV_ACCOUNT_PASSWORD=(.+)$/m)?.[1];
if (!password) throw new Error("LAPTOP_DEV_ACCOUNT_PASSWORD is missing from .env.laptop-dev");
const keystoreDirectory = resolve(projectRoot, "devnet", "laptop-node-1", "keystore");
const name = (await readdir(keystoreDirectory)).find((value) => value.toLowerCase().endsWith(address.slice(2).toLowerCase()));
if (!name) throw new Error(`No local keystore was found for ${address}`);
const wallet = await Wallet.fromEncryptedJson(await readFile(resolve(keystoreDirectory, name), "utf8"), password);
const derived = deriveAgentCredential(credential);
const signature = await wallet.signMessage(getBytes(derived.credentialId));
const output = { credential, proof: { scheme: "eip191-personal-sign", credentialId: derived.credentialId, signature } };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Credential ID: ${derived.credentialId}`);
console.log(`Wrote: ${outputPath}`);

