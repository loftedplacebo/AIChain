import test from "node:test";
import assert from "node:assert/strict";
import { buildOrganisationView, createDisclosurePackage } from "./organisation-view.js";
import { createCheckpoint, membershipProof } from "./organisational-ledger.js";

const receiptIds = [
  "0x0000000000000000000000000000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000000000000000000000000000002",
];

test("organisation view reports private inventory without requiring evidence contents", () => {
  const result = buildOrganisationView({
    schema: "aichain.organisation-view",
    schemaVersion: "0.1.0-draft",
    organisation: { ref: "org:test", ledgerId: "ledger:test" },
    agents: [{ id: "agent:1", status: "active" }, { id: "agent:2", status: "revoked" }],
    policies: [{ id: "policy:1", status: "active" }],
    configurations: [{ id: "config:1", status: "active" }],
    checkpoints: [{ epoch: 0, anchor: { transactionHash: "0xabc" } }],
  });
  assert.deepEqual(result.inventory.agents, { total: 2, active: 1 });
  assert.equal(result.inventory.checkpoints.anchored, 1);
});

test("disclosure package carries a proof and evidence reference, never evidence contents", () => {
  const checkpoint = createCheckpoint({ organisationRef: "org:test", ledgerId: "ledger:test", epoch: 0, receiptIds, createdAt: "2026-08-22T12:00:00Z" });
  const disclosure = createDisclosurePackage({
    checkpointPayload: { checkpoint, inclusionProof: { receiptId: receiptIds[0], leafIndex: 0, siblings: membershipProof(receiptIds, 0) } },
    evidenceReference: "vault://private/receipt-1",
    disclosedAt: "2026-08-22T12:01:00Z",
  });
  assert.equal(disclosure.verification.localMembership, true);
  assert.equal(disclosure.verification.evidenceIncluded, false);
  assert.equal("evidence" in disclosure, false);
});

