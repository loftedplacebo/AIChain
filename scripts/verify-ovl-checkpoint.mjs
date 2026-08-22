#!/usr/bin/env node
// Read-only verification of an OVL inclusion proof against the development batch anchor.

import { readFile } from "node:fs/promises";
import { JsonRpcProvider, Contract } from "ethers";
import { verifyMembership } from "../sdk/typescript/organisational-ledger.js";

const [checkpointPath] = process.argv.slice(2);
const batchAnchor = "0xE680eEb44688898c108FAf2bF8589d108Fe86fE8";
if (!checkpointPath) throw new Error("Usage: node scripts/verify-ovl-checkpoint.mjs checkpoint.json");
const payload = JSON.parse(await readFile(checkpointPath, "utf8"));
const { checkpoint, inclusionProof } = payload;
if (!checkpoint || !inclusionProof) throw new Error("Expected a sealed OVL checkpoint with inclusionProof");
const localMembership = verifyMembership(inclusionProof.receiptId, inclusionProof.siblings, checkpoint.receiptRoot);
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const anchor = new Contract(batchAnchor, [
  "function getBatch(bytes32 batchRoot) view returns ((address issuer,uint64 includedAt,uint64 leafCount,string schemaVersion) batch)",
  "function verifyMembership(bytes32 receiptId,bytes32[] proof,bytes32 batchRoot) view returns (bool)",
], provider);
const batch = await anchor.getBatch(checkpoint.receiptRoot);
const onChainMembership = await anchor.verifyMembership(inclusionProof.receiptId, inclusionProof.siblings, checkpoint.receiptRoot);
const result = {
  checkpointRoot: checkpoint.receiptRoot,
  receiptId: inclusionProof.receiptId,
  localMembership,
  onChainMembership,
  anchoredLeafCount: Number(batch.leafCount),
  checkpointLeafCount: checkpoint.leafCount,
  schemaVersionMatches: batch.schemaVersion === checkpoint.schemaVersion,
  valid: localMembership && onChainMembership && Number(batch.leafCount) === checkpoint.leafCount && batch.schemaVersion === checkpoint.schemaVersion,
};
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
