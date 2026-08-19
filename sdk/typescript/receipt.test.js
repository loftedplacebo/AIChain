const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { deriveReceipt, prepareAnchor, verifyReceiptAgainstAnchor } = require("./receipt");

const fixturePath = path.join(__dirname, "..", "..", "fixtures", "avr", "receipt-v0.1.0-draft.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const demoFixturePath = path.join(__dirname, "..", "..", "fixtures", "avr", "receipt-v0.1.0-draft-demo-2.json");
const demoFixture = JSON.parse(fs.readFileSync(demoFixturePath, "utf8"));

test("derives the fixture receipt ID and commitments root", () => {
  const derived = deriveReceipt(fixture);
  assert.equal(derived.receiptId, fixture.expected.receiptId);
  assert.equal(derived.commitmentsRoot, fixture.expected.commitmentsRoot);
});

test("derives the second demo receipt ID and commitments root", () => {
  const derived = deriveReceipt(demoFixture);
  assert.equal(derived.receiptId, demoFixture.expected.receiptId);
  assert.equal(derived.commitmentsRoot, demoFixture.expected.commitmentsRoot);
});

test("changes the receipt ID when a committed value changes", () => {
  const changed = structuredClone(fixture);
  changed.commitments.input = `0x${"aa".repeat(32)}`;
  assert.notEqual(deriveReceipt(changed).receiptId, deriveReceipt(fixture).receiptId);
  assert.notEqual(deriveReceipt(changed).commitmentsRoot, deriveReceipt(fixture).commitmentsRoot);
});

test("verifies a matching anchor and rejects a changed receipt", () => {
  const anchor = {
    receiptId: fixture.expected.receiptId,
    commitmentsRoot: fixture.expected.commitmentsRoot,
    schemaVersion: fixture.schemaVersion,
    issuer: fixture.issuer
  };
  assert.equal(verifyReceiptAgainstAnchor(fixture, anchor).valid, true);

  const changed = structuredClone(fixture);
  changed.commitments.policy = `0x${"bb".repeat(32)}`;
  assert.equal(verifyReceiptAgainstAnchor(changed, anchor).valid, false);
});

test("prepares the contract anchor fields from a receipt", () => {
  assert.deepEqual(prepareAnchor(fixture), {
    receiptId: fixture.expected.receiptId,
    commitmentsRoot: fixture.expected.commitmentsRoot,
    schemaVersion: fixture.schemaVersion,
    claimedIssuer: fixture.issuer
  });
});
