const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("../../fixtures/avr/authorised-receipt-v0.2.0-draft.json");
const { deriveAuthorisedReceipt, prepareAuthorisedAnchor } = require("./authorised-receipt");

test("derives an authorised receipt and the contract binding fields", () => {
  const derived = deriveAuthorisedReceipt(fixture);
  const anchor = prepareAuthorisedAnchor(fixture);
  assert.match(derived.receiptId, /^0x[0-9a-f]{64}$/);
  assert.equal(anchor.organizationId, fixture.identity.organizationId);
  assert.equal(anchor.authorityCommitment, fixture.identity.authorityCommitment);
  assert.equal(anchor.issuer, fixture.issuer);
});

test("authorised receipt changes when the authority reference changes", () => {
  const changed = structuredClone(fixture);
  changed.identity.authorityCommitment = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.notEqual(deriveAuthorisedReceipt(changed).receiptId, deriveAuthorisedReceipt(fixture).receiptId);
});

