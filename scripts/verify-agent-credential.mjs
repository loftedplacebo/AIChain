#!/usr/bin/env node
// Read-only local verification of a development credential package.

import { readFile } from "node:fs/promises";
import credentialModule from "../sdk/typescript/agent-credential.js";

const [packagePath] = process.argv.slice(2);
if (!packagePath) throw new Error("Usage: node scripts/verify-agent-credential.mjs credential-package.json");
const result = credentialModule.verifyCredentialPackage(JSON.parse(await readFile(packagePath, "utf8")));
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;

