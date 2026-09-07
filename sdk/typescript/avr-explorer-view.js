const { assuranceSummary, validatePresentation } = require("./avr-presentation");
const { verifyBatchMembership } = require('./avr-anchor-verifier');
function buildExplorerView(presentation, indexEntry, explorerBaseUrl = null) {
  validatePresentation(presentation);
  if (!indexEntry?.anchor) throw new Error("A durable index entry is required");
  const anchor = indexEntry.anchor;
  if (indexEntry.mode === 'individual') {
    if (anchor.receiptId !== presentation.receiptId || anchor.commitmentsRoot !== presentation.commitmentsRoot) throw Error('Index/presentation binding mismatch');
  } else if (indexEntry.mode !== 'batch' || !verifyBatchMembership(presentation.receiptId, indexEntry.inclusion?.siblings, anchor.batchRoot)) {
    throw Error('Index/presentation membership mismatch');
  }
  const base = explorerBaseUrl ? explorerBaseUrl.replace(/\/$/, "") : null;
  return {
    schema: "aichain.avr-explorer-view", schemaVersion: "0.1.0-draft", ...assuranceSummary(presentation),
    anchored: true, anchorMode: indexEntry.mode,
    verificationStatus: 'indexed-inclusion-not-finality',
    proofVerification: 'not-checked-by-explorer',
    anchor: { mode: indexEntry.mode, blockNumber: anchor.blockNumber, blockHash: anchor.blockHash, transactionHash: anchor.transactionHash, contract: anchor.contract, schemaVersion: anchor.schemaVersion },
    links: base ? { transaction: `${base}/tx/${anchor.transactionHash}`, block: `${base}/block/${anchor.blockNumber}`, address: `${base}/address/${anchor.contract}` } : null,
    privacy: "Contains receipt commitments and public chain references only; no raw AI evidence is displayed."
  };
}
module.exports = { buildExplorerView };
