const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { deriveReceipt } = require("./receipt");

const fixturePath = path.join(__dirname, "..", "..", "fixtures", "avr", "receipt-v0.1.0-draft.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

test("derives the fixture receipt ID and commitments root", () => {
  const derived = deriveReceipt(fixture);
  assert.equal(derived.receiptId, fixture.expected.receiptId);
  assert.equal(derived.commitmentsRoot, fixture.expected.commitmentsRoot);
});

test("changes the receipt ID when a committed value changes", () => {
  const changed = structuredClone(fixture);
  changed.commitments.input = `0x${"aa".repeat(32)}`;
  assert.notEqual(deriveReceipt(changed).receiptId, deriveReceipt(fixture).receiptId);
  assert.notEqual(deriveReceipt(changed).commitmentsRoot, deriveReceipt(fixture).commitmentsRoot);
});
