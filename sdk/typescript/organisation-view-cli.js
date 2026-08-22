#!/usr/bin/env node
// Produce a local/private organisation-control-plane report or an auditor disclosure package.

import { readFile, writeFile } from "node:fs/promises";
import { buildOrganisationView, createDisclosurePackage } from "./organisation-view.js";

const [command, inputPath, outputPath, evidenceReference] = process.argv.slice(2);
if (!command || !inputPath || !outputPath) {
  throw new Error("Usage: node sdk/typescript/organisation-view-cli.js <report|disclose> input.json output.json [evidenceReference]");
}
const input = JSON.parse(await readFile(inputPath, "utf8"));
if (command === "report") {
  const report = buildOrganisationView(input);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Organisation: ${report.organisation.displayName}`);
  console.log(`Active agents: ${report.inventory.agents.active}/${report.inventory.agents.total}`);
  console.log(`Anchored checkpoints: ${report.inventory.checkpoints.anchored}/${report.inventory.checkpoints.total}`);
  console.log(`Wrote: ${outputPath}`);
} else if (command === "disclose") {
  const disclosure = createDisclosurePackage({ checkpointPayload: input, evidenceReference, disclosedAt: new Date().toISOString() });
  await writeFile(outputPath, `${JSON.stringify(disclosure, null, 2)}\n`);
  console.log(`Receipt: ${disclosure.receiptId}`);
  console.log(`Wrote: ${outputPath}`);
} else {
  throw new Error("command must be report or disclose");
}

