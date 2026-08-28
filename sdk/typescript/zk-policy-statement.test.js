const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { derivePublic, evaluate, verify } = require("./zk-policy-statement");

const fixturePath = path.join(__dirname, "..", "..", "fixtures", "zk", "policy-evaluation-v0.1.0-draft.json");
const load = () => JSON.parse(fs.readFileSync(fixturePath, "utf8"));

test("matches the shared golden vector", () => {
  const document = load();
  assert.deepEqual(derivePublic(document.publicMetadata, document.privateWitness), document.expectedPublic);
  assert.equal(verify(document), true);
});

test("rejects action, policy and public-input substitution", () => {
  for (const mutate of [
    (d) => { d.privateWitness.action.amount = 1001; },
    (d) => { d.privateWitness.policy.maxAmount = 500; },
    (d) => { d.expectedPublic.receiptId = `0x${"ff".repeat(32)}`; },
    (d) => { d.expectedPublic.programCommitment = `0x${"ff".repeat(32)}`; }
  ]) {
    const document = load(); mutate(document); assert.equal(verify(document), false);
  }
});

test("uses deterministic deny reason order", () => {
  const document = load();
  document.privateWitness.action = { operation: "delete", resource: "production", amount: 1001 };
  assert.deepEqual(evaluate(document.privateWitness).reasonCodes,
    ["operation-not-allowed", "resource-not-allowed", "amount-exceeds-limit"]);
});
