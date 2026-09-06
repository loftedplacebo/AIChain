const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { AVR_EVENTS, hashPair, verifyBatchMembership, verifyPresentationAnchor } = require("./avr-anchor-verifier");
const { createPresentation } = require("./avr-presentation");

const root = path.join(__dirname, "..", "..");
const receipt = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "avr", "receipt-v0.1.0-draft.json"), "utf8"));
const contract = "0xE680eEb44688898c108FAf2bF8589d108Fe86fE8";
const txHash = `0x${"ab".repeat(32)}`;

function providerFor(logs, overrides = {}) {
  return {
    getNetwork: async () => ({ chainId: overrides.chainId ?? 20260822n }),
    getBlockNumber: async () => overrides.latestBlock ?? 102,
    getTransactionReceipt: async () => overrides.receipt ?? { status: 1, hash: txHash, blockNumber: 100, logs }
  };
}

function eventLog(name, values) {
  const encoded = AVR_EVENTS.encodeEventLog(AVR_EVENTS.getEvent(name), values);
  return { address: contract, topics: encoded.topics, data: encoded.data };
}

function rootAndProof(leaves, leafIndex) {
  let index = leafIndex;
  let level = leaves;
  const siblings = [];
  while (level.length > 1) {
    siblings.push(level[index ^ 1] ?? level[index]);
    const next = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) next.push(hashPair(level[cursor], level[cursor + 1] ?? level[cursor]));
    level = next;
    index = Math.floor(index / 2);
  }
  return { batchRoot: level[0], siblings };
}

test("validates an individual AVR anchor from an ordinary transaction receipt", async () => {
  const presentation = createPresentation(receipt, { level: "commitment-only" }, { mode: "individual", chainId: 20260822, contract, transactionHash: txHash });
  const log = eventLog("ReceiptAnchored", [presentation.receiptId, presentation.commitmentsRoot, receipt.issuer.toLowerCase(), receipt.schemaVersion, 42]);
  assert.deepEqual(await verifyPresentationAnchor(presentation, providerFor([log])), {
    valid: true, mode: "individual", confirmations: 3, blockNumber: 100, event: "ReceiptAnchored"
  });
});

test("requires a matching event, successful transaction and sufficient confirmations", async () => {
  const presentation = createPresentation(receipt, { level: "commitment-only" }, { mode: "individual", chainId: 20260822, contract, transactionHash: txHash });
  assert.equal((await verifyPresentationAnchor(presentation, providerFor([]))).valid, false);
  assert.equal((await verifyPresentationAnchor(presentation, providerFor([], { receipt: { status: 0, hash: txHash, blockNumber: 100, logs: [] } }))).reason, "Anchor transaction did not succeed");
  const log = eventLog("ReceiptAnchored", [presentation.receiptId, presentation.commitmentsRoot, receipt.issuer.toLowerCase(), receipt.schemaVersion, 42]);
  assert.equal((await verifyPresentationAnchor(presentation, providerFor([log], { latestBlock: 100 }), { minimumConfirmations: 2 })).reason, "Anchor has insufficient confirmations");
});

test("requires an anchored batch event and a valid receipt inclusion proof", async () => {
  const other = `0x${"11".repeat(32)}`;
  const ids = [receipt.expected.receiptId, other];
  const { batchRoot, siblings } = rootAndProof(ids, 0);
  const presentation = createPresentation(receipt, { level: "commitment-only" }, {
    mode: "batch", chainId: 20260822, contract, transactionHash: txHash,
    batch: { batchRoot, leafCount: 2, schemaVersion: "0.1.0-draft", siblings }
  });
  const log = eventLog("ReceiptBatchAnchored", [batchRoot, receipt.issuer.toLowerCase(), 2, "0.1.0-draft", 42]);
  assert.equal(verifyBatchMembership(presentation.receiptId, siblings, batchRoot), true);
  assert.equal((await verifyPresentationAnchor(presentation, providerFor([log]))).valid, true);

  const withoutProof = structuredClone(presentation);
  delete withoutProof.anchor.batch;
  assert.equal((await verifyPresentationAnchor(withoutProof, providerFor([log]))).reason, "Batch anchor requires batch root and receipt inclusion proof");
});
