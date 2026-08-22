#!/usr/bin/env node
// Read-only end-to-end audit report for a historical-authorisation receipt.

import { readFile } from "node:fs/promises";
import { Contract, JsonRpcProvider } from "ethers";
import receiptModule from "../sdk/typescript/authorised-receipt.js";
import auditModule from "../sdk/typescript/historical-audit.js";

const [receiptPath, anchorAddress, registryAddress] = process.argv.slice(2);
if (!receiptPath || !/^0x[0-9a-fA-F]{40}$/.test(anchorAddress ?? "") || !/^0x[0-9a-fA-F]{40}$/.test(registryAddress ?? "")) {
  throw new Error("Usage: node scripts/verify-historical-authorised-avr.mjs receipt.json 0xHistoricalAnchor 0xHistoricalRegistry");
}
const prepared = receiptModule.prepareAuthorisedAnchor(JSON.parse(await readFile(receiptPath, "utf8")));
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const anchorContract = new Contract(anchorAddress, ["function getAnchor(bytes32) view returns ((bytes32 organizationId,bytes32 authorityCommitment,bytes32 commitmentsRoot,address issuer,uint64 authorisationCheckedAt,string schemaVersion) anchor)"], provider);
const registry = new Contract(registryAddress, ["function isAuthorisedAt(bytes32,address,bytes32,uint64) view returns (bool)"], provider);
const anchor = await anchorContract.getAnchor(prepared.receiptId);
const authorisedAtInclusion = await registry.isAuthorisedAt(prepared.organizationId, prepared.issuer, prepared.authorityCommitment, anchor.authorisationCheckedAt);
const report = auditModule.buildHistoricalAuditReport({ prepared, anchor, authorisedAtInclusion });
console.log(JSON.stringify(report, null, 2));
if (!report.valid) process.exitCode = 1;

