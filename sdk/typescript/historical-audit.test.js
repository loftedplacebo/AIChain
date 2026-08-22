const test = require("node:test");
const assert = require("node:assert/strict");
const { buildHistoricalAuditReport } = require("./historical-audit");

const prepared = { receiptId: "0x01", schemaVersion: "0.2.0-draft", organizationId: "0x02", authorityCommitment: "0x03", commitmentsRoot: "0x04", issuer: "0x05" };
const anchor = { organizationId: "0x02", authorityCommitment: "0x03", commitmentsRoot: "0x04", issuer: "0x05", authorisationCheckedAt: 42n, schemaVersion: "0.2.0-draft" };

test("historical audit report requires all receipt bindings and historical authority", () => {
  assert.equal(buildHistoricalAuditReport({ prepared, anchor, authorisedAtInclusion: true }).valid, true);
  assert.equal(buildHistoricalAuditReport({ prepared, anchor, authorisedAtInclusion: false }).valid, false);
  assert.equal(buildHistoricalAuditReport({ prepared, anchor: { ...anchor, issuer: "0x06" }, authorisedAtInclusion: true }).valid, false);
});

