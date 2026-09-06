#!/usr/bin/env node
// CLI for creating and checking proof-aware batch manifests. Development/alpha tooling only.

import fs from "node:fs";
import { createProofBatch, proofClaimInclusion, verifyProofClaimInclusion } from "./zk-proof-batch.js";

const [command, inputPath, outputPath, index] = process.argv.slice(2);
if (!command || !inputPath || !outputPath || !["create", "inclusion", "verify"].includes(command)) throw new Error("Usage: zk-proof-batch-cli.js create <claims.json> <manifest.json> | inclusion <manifest.json> <inclusion.json> <index> | verify <manifest.json> <inclusion.json>");

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (command === "create") fs.writeFileSync(outputPath, `${JSON.stringify(createProofBatch(input), null, 2)}\n`);
else if (command === "inclusion") {
  if (!/^\d+$/.test(index ?? "")) throw new Error("index must be a non-negative integer");
  fs.writeFileSync(outputPath, `${JSON.stringify(proofClaimInclusion(input, Number(index)), null, 2)}\n`);
} else {
  const inclusion = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  console.log(JSON.stringify({ valid: verifyProofClaimInclusion(input, inclusion) }));
}
