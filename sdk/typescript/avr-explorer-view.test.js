const assert = require("node:assert/strict"); const fs = require("node:fs"); const path = require("node:path"); const test = require("node:test");
const { createPresentation } = require("./avr-presentation"); const { buildExplorerView } = require("./avr-explorer-view");
const receipt = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "fixtures", "avr", "receipt-v0.1.0-draft.json"), "utf8"));
test("builds a Blockscout-compatible public reference view without raw evidence", () => {
 const presentation = createPresentation(receipt, { level: "commitment-only" }); const view = buildExplorerView(presentation, { mode: "individual", anchor: { receiptId:presentation.receiptId, commitmentsRoot:presentation.commitmentsRoot, blockNumber: 12, blockHash: `0x${"11".repeat(32)}`, transactionHash: `0x${"22".repeat(32)}`, contract: "0xE680eEb44688898c108FAf2bF8589d108Fe86fE8", schemaVersion: "0.1.0-draft" } }, "http://127.0.0.1:4000");
 assert.equal(view.links.transaction, `http://127.0.0.1:4000/tx/0x${"22".repeat(32)}`); assert.match(view.privacy, /no raw AI evidence/);
});
test('rejects unrelated indexed receipts', () => {
 const p=createPresentation(receipt,{level:'commitment-only'});
 assert.throws(()=>buildExplorerView(p,{mode:'individual',anchor:{receiptId:'wrong'}}),/binding/);
 assert.throws(()=>buildExplorerView(p,{mode:'batch',anchor:{batchRoot:'wrong'},inclusion:{siblings:[]}}),/membership/);
});
