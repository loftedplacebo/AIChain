import test from "node:test";
import assert from "node:assert/strict";
import { createProofBatch, proofClaimInclusion, proofClaimLeaf, proofSystemId, verifyProofClaimInclusion } from "./zk-proof-batch.js";

const value = (number) => `0x${number.toString(16).padStart(64, "0")}`;
const system = proofSystemId("risc0", "3.0.3");
const statement = value(101);
const program = value(102);
const claim = (number) => ({ proofSystemId: system, statementId: statement, programCommitment: program, receiptId: value(number), publicValuesDigest: value(number + 1000), proofDigest: value(number + 2000) });

test("proof-aware batch commits each RISC Zero proof claim and verifies inclusion", () => {
  const batch = createProofBatch({ proofSystemId: system, statementId: statement, programCommitment: program, claims: [claim(1), claim(2), claim(3)], createdAt: "2026-09-06T12:00:00Z" });
  const inclusion = proofClaimInclusion(batch, 2);
  assert.equal(batch.claimCount, 3);
  assert.equal(verifyProofClaimInclusion(batch, inclusion), true);
  assert.equal(verifyProofClaimInclusion(batch, { ...inclusion, claim: { ...inclusion.claim, proofDigest: value(9999) } }), false);
  assert.equal(proofClaimLeaf(inclusion.claim) === proofClaimLeaf({ ...inclusion.claim, receiptId: value(99) }), false);
});

test("proof-aware batch rejects mixed statement bindings and duplicate receipts", () => {
  assert.throws(() => createProofBatch({ proofSystemId: system, statementId: statement, programCommitment: program, claims: [claim(1), { ...claim(2), statementId: value(103) }], createdAt: "2026-09-06T12:00:00Z" }), /does not match/);
  assert.throws(() => createProofBatch({ proofSystemId: system, statementId: statement, programCommitment: program, claims: [claim(1), { ...claim(1), proofDigest: value(3000) }], createdAt: "2026-09-06T12:00:00Z" }), /duplicates/);
});

test("proof-system identifiers are version-specific", () => assert.notEqual(proofSystemId("risc0", "3.0.3"), proofSystemId("risc0", "3.0.4")));
