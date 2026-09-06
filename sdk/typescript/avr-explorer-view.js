const { assuranceSummary, validatePresentation } = require("./avr-presentation");
function buildExplorerView(presentation, indexEntry, explorerBaseUrl = null) {
  validatePresentation(presentation);
  if (!indexEntry?.anchor) throw new Error("A durable index entry is required");
  const anchor = indexEntry.anchor;
  const base = explorerBaseUrl ? explorerBaseUrl.replace(/\/$/, "") : null;
  return {
    schema: "aichain.avr-explorer-view", schemaVersion: "0.1.0-draft", ...assuranceSummary(presentation),
    anchor: { mode: indexEntry.mode, blockNumber: anchor.blockNumber, blockHash: anchor.blockHash, transactionHash: anchor.transactionHash, contract: anchor.contract, schemaVersion: anchor.schemaVersion },
    links: base ? { transaction: `${base}/tx/${anchor.transactionHash}`, block: `${base}/block/${anchor.blockNumber}`, address: `${base}/address/${anchor.contract}` } : null,
    privacy: "Contains receipt commitments and public chain references only; no raw AI evidence is displayed."
  };
}
module.exports = { buildExplorerView };
