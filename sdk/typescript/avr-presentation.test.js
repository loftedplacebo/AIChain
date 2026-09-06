const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createPresentation, derivePresentation, assuranceSummary, validatePresentation } = require("./avr-presentation");

const root = path.join(__dirname, "..", "..");
const receipt = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "avr", "receipt-v0.1.0-draft.json"), "utf8"));
const authorisedReceipt = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "avr", "authorised-receipt-v0.2.0-draft.json"), "utf8"));

const anchor = {
  mode: "batch",
  chainId: 20260822,
  contract: "0xE680eEb44688898c108FAf2bF8589d108Fe86fE8",
  transactionHash: `0x${"ab".repeat(32)}`
};

test("creates a stable commitment-only presentation without changing legacy receipt IDs", () => {
  const presentation = createPresentation(receipt, { level: "commitment-only" }, null);
  assert.equal(presentation.receiptId, receipt.expected.receiptId);
  assert.equal(presentation.commitmentsRoot, receipt.expected.commitmentsRoot);
  assert.equal(derivePresentation(presentation).presentationId, "0x07c328d358d4a86455ee6b27d2a91a7ef10ebf252a6f89fc2f0b29b83e0ab6d3");
  assert.deepEqual(assuranceSummary(presentation), {
    receiptId: receipt.expected.receiptId,
    presentationId: "0x07c328d358d4a86455ee6b27d2a91a7ef10ebf252a6f89fc2f0b29b83e0ab6d3",
    assuranceLevel: "commitment-only",
    anchored: false,
    anchorMode: null,
    proofSystem: null,
    proofVerification: null,
    scope: "Evidence binds committed AVR data; it does not establish model-output truth."
  });
});

test("supports the existing organisation-authorised profile with batch location metadata", () => {
  const presentation = createPresentation(authorisedReceipt, { level: "organisation-authorised" }, anchor);
  assert.equal(presentation.receipt.schemaVersion, "0.2.0-draft");
  assert.equal(assuranceSummary(presentation).anchorMode, "batch");
});

test("requires explicit proof references for zk-proved presentations", () => {
  const proof = {
    system: "risc0",
    programCommitment: `0x${"11".repeat(32)}`,
    publicValuesDigest: `0x${"22".repeat(32)}`,
    proofDigest: `0x${"33".repeat(32)}`,
    verification: "batch-claim"
  };
  const presentation = createPresentation(receipt, { level: "zk-proved", proof }, anchor);
  assert.equal(assuranceSummary(presentation).proofSystem, "risc0");
  assert.equal(assuranceSummary(presentation).proofVerification, "batch-claim");

  assert.throws(() => createPresentation(receipt, { level: "zk-proved" }));
  assert.throws(() => createPresentation(receipt, { level: "organisation-authorised" }));
});

test("rejects substituted receipt identifiers and untyped anchor data", () => {
  const presentation = createPresentation(receipt, { level: "commitment-only" });
  presentation.receiptId = `0x${"ff".repeat(32)}`;
  assert.throws(() => validatePresentation(presentation));

  assert.throws(() => createPresentation(receipt, { level: "commitment-only" }, { ...anchor, mode: "unknown" }));
});
