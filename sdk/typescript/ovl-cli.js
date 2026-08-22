#!/usr/bin/env node
// Seal an OVL checkpoint and emit an inclusion-proof package.

import { readFile, writeFile } from "node:fs/promises";
import { createCheckpoint, membershipProof } from "./organisational-ledger.js";

const [command, inputPath, outputPath, leafIndexRaw] = process.argv.slice(2);
if (command !== "seal" || !inputPath || !outputPath) {
  throw new Error("Usage: node sdk/typescript/ovl-cli.js seal receipts.json checkpoint.json [leafIndex]");
}

const input = JSON.parse(await readFile(inputPath, "utf8"));
const checkpoint = createCheckpoint({
  organisationRef: input.organisationRef,
  ledgerId: input.ledgerId,
  epoch: input.epoch,
  previousCheckpoint: input.previousCheckpoint ?? null,
  receiptIds: input.receiptIds,
  createdAt: input.createdAt,
});
const leafIndex = leafIndexRaw === undefined ? 0 : Number(leafIndexRaw);
if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= checkpoint.receiptIds.length) {
  throw new Error("leafIndex is outside receiptIds");
}
const output = {
  checkpoint,
  inclusionProof: {
    receiptId: checkpoint.receiptIds[leafIndex],
    leafIndex,
    siblings: membershipProof(checkpoint.receiptIds, leafIndex),
  },
};
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Checkpoint root: ${checkpoint.receiptRoot}`);
console.log(`Leaf count: ${checkpoint.leafCount}`);
console.log(`Wrote: ${outputPath}`);

