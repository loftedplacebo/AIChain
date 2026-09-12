// Phase 2D alpha: verify an AVR presentation against standard, local Ethereum JSON-RPC.
// No AI-specific RPC calls are made here; this reads ordinary transaction receipts.

const { Interface, concat, keccak256 } = require("ethers");
const { validatePresentation } = require("./avr-presentation");

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const AVR_EVENTS = new Interface([
  "event ReceiptAnchored(bytes32 indexed receiptId, bytes32 indexed commitmentsRoot, address indexed issuer, string schemaVersion, uint64 includedAt)",
  "event AuthorisedReceiptAnchored(bytes32 indexed receiptId, bytes32 indexed organizationId, bytes32 indexed authorityCommitment, address issuer, bytes32 commitmentsRoot, string schemaVersion, uint64 includedAt)",
  "event ReceiptBatchAnchored(bytes32 indexed batchRoot, address indexed issuer, uint64 leafCount, string schemaVersion, uint64 includedAt)"
]);

function normalise(value) { return typeof value === "string" ? value.toLowerCase() : value; }
function sameHex(left, right) { return normalise(left) === normalise(right); }

function hashPair(left, right) {
  if (![left, right].every((value) => typeof value === "string" && BYTES32.test(value))) throw new Error("Merkle values must be bytes32");
  return normalise(left) <= normalise(right)
    ? keccak256(concat([left, right]))
    : keccak256(concat([right, left]));
}

function verifyBatchMembership(receiptId, siblings, batchRoot) {
  if (!Array.isArray(siblings) || !BYTES32.test(batchRoot)) return false;
  try {
    return sameHex(siblings.reduce((computed, sibling) => hashPair(computed, sibling), receiptId), batchRoot);
  } catch { return false; }
}

function invalid(reason, details = {}) { return { valid: false, reason, ...details }; }

function parsedAnchorEvents(logs, contract) {
  return logs.filter((log) => sameHex(log.address, contract)).flatMap((log) => {
    try { return [AVR_EVENTS.parseLog(log)]; } catch { return []; }
  });
}

function receiptSucceeded(receipt) { return receipt?.status === 1 || receipt?.status === "0x1"; }

async function verifyPresentationAnchor(presentation, provider, { minimumConfirmations = 1 } = {}) {
  validatePresentation(presentation);
  if (!Number.isInteger(minimumConfirmations) || minimumConfirmations < 1) throw new Error("minimumConfirmations must be at least one");
  const anchor = presentation.anchor;
  if (anchor === null) return invalid("Presentation has no anchor location");

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== anchor.chainId) return invalid("Anchor chainId does not match connected node", { expectedChainId: anchor.chainId, actualChainId: Number(network.chainId) });
  const receipt = await provider.getTransactionReceipt(anchor.transactionHash);
  if (!receipt) return invalid("Anchor transaction was not found");
  if (!receiptSucceeded(receipt)) return invalid("Anchor transaction did not succeed");
  const actualHash = receipt.hash ?? receipt.transactionHash;
  if (!sameHex(actualHash, anchor.transactionHash)) return invalid("Returned transaction receipt hash does not match anchor");
  if (!Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber < 0) return invalid("Anchor receipt has no canonical block number");
  if (typeof receipt.blockHash !== 'string' || !BYTES32.test(receipt.blockHash)) return invalid('Anchor receipt has no block hash');
  const latestBlock = await provider.getBlockNumber();
  if (!Number.isSafeInteger(latestBlock) || latestBlock < 0) return invalid('Node returned an invalid head number');
  const confirmations = Math.max(0, latestBlock - receipt.blockNumber + 1);
  if (confirmations < minimumConfirmations) return invalid("Anchor has insufficient confirmations", { confirmations, minimumConfirmations });
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block || block.number !== receipt.blockNumber || !sameHex(block.hash, receipt.blockHash)) {
    return invalid('Anchor transaction is not in the canonical block', { confirmations });
  }
  // Inclusion remains provisional: a later PoW reorganisation can invalidate it.
  if ((receipt.logs ?? []).some(log => log.removed === true || (log.blockHash && !sameHex(log.blockHash, receipt.blockHash)))) {
    return invalid('Anchor logs do not match the canonical receipt block', { confirmations });
  }

  const events = parsedAnchorEvents(receipt.logs ?? [], anchor.contract);
  if (anchor.mode === "individual") {
    const expectedAuthorised = presentation.receipt.schema === "aichain.authorised-avr";
    const event = events.find((item) => item.name === (expectedAuthorised ? "AuthorisedReceiptAnchored" : "ReceiptAnchored") && sameHex(item.args[0], presentation.receiptId));
    if (!event) return invalid("Expected individual AVR anchor event was not found", { confirmations });
    const args = event.args;
    const receiptId = args[0];
    const commitmentsRoot = expectedAuthorised ? args[4] : args[1];
    const issuer = expectedAuthorised ? args[3] : args[2];
    const schemaVersion = expectedAuthorised ? args[5] : args[3];
    if (!sameHex(receiptId, presentation.receiptId) || !sameHex(commitmentsRoot, presentation.commitmentsRoot)
      || !sameHex(issuer, presentation.receipt.issuer) || schemaVersion !== presentation.receipt.schemaVersion) {
      return invalid("Individual anchor event does not bind the presented receipt", { confirmations });
    }
    if (expectedAuthorised && (!sameHex(args[1], presentation.receipt.identity.organizationId) || !sameHex(args[2], presentation.receipt.identity.authorityCommitment))) {
      return invalid("Authorised anchor event does not bind the presented organisation authority", { confirmations });
    }
    return { valid: true, mode: "individual", confirmations, blockNumber: receipt.blockNumber, event: event.name };
  }

  // A batch event alone is deliberately insufficient. The caller must provide
  // the event's root, count/version and a receipt-specific sorted Merkle proof.
  const evidence = anchor.batch;
  if (!evidence || typeof evidence !== "object") return invalid("Batch anchor requires batch root and receipt inclusion proof", { confirmations });
  if (!BYTES32.test(evidence.batchRoot) || !Array.isArray(evidence.siblings) || !Number.isInteger(evidence.leafCount) || evidence.leafCount < 1 || typeof evidence.schemaVersion !== "string" || !evidence.schemaVersion) {
    return invalid("Batch inclusion evidence is malformed", { confirmations });
  }
  const event = events.find((item) => item.name === "ReceiptBatchAnchored" && sameHex(item.args[0], evidence.batchRoot));
  if (!event) return invalid("Expected receipt batch anchor event was not found", { confirmations });
  if (Number(event.args[2]) !== evidence.leafCount || event.args[3] !== evidence.schemaVersion) {
    return invalid("Batch anchor event does not match supplied batch metadata", { confirmations });
  }
  if (!verifyBatchMembership(presentation.receiptId, evidence.siblings, evidence.batchRoot)) {
    return invalid("Receipt inclusion proof does not resolve to anchored batch root", { confirmations });
  }
  return { valid: true, mode: "batch", confirmations, blockNumber: receipt.blockNumber, event: event.name, batchRoot: normalise(evidence.batchRoot) };
}

module.exports = { AVR_EVENTS, hashPair, verifyBatchMembership, verifyPresentationAnchor };
