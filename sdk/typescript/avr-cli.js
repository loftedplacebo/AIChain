#!/usr/bin/env node
// Small JSON CLI for the Phase 1B AVR draft reference implementation.

const fs = require("node:fs");
const { deriveReceipt, prepareAnchor, verifyReceiptAgainstAnchor } = require("./receipt");

const [command, receiptPath, anchorPath] = process.argv.slice(2);
if (!["derive", "prepare-anchor", "verify-anchor"].includes(command) || !receiptPath || (command === "verify-anchor" && !anchorPath)) {
  throw new Error("Usage: avr-cli.js <derive|prepare-anchor> receipt.json | verify-anchor receipt.json anchor.json");
}

const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
let result;
if (command === "derive") result = deriveReceipt(receipt);
else if (command === "prepare-anchor") result = prepareAnchor(receipt);
else result = verifyReceiptAgainstAnchor(receipt, JSON.parse(fs.readFileSync(anchorPath, "utf8")));
console.log(JSON.stringify(result));
