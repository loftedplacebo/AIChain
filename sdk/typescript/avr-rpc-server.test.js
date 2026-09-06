const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPresentation } = require("./avr-presentation");
const { createPresentationIndex, createLocalAvrRpcServer, dispatch, requireLoopbackOptIn } = require("./avr-rpc-server");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "fixtures", "avr", "receipt-v0.1.0-draft.json"), "utf8"));
const presentation = createPresentation(fixture, { level: "commitment-only" });
const index = createPresentationIndex([presentation]);

test("exposes only the small versioned AVR method allow-list", async () => {
  const info = await dispatch({ jsonrpc: "2.0", id: 1, method: "aichain_avrRpcInfo", params: [] }, { index });
  assert.equal(info.result.transport, "loopback-only");
  assert.equal(info.result.rawAiDataAccepted, false);
  assert.equal((await dispatch({ jsonrpc: "2.0", id: 2, method: "eth_chainId", params: [] }, { index })).error.code, -32601);
});

test("looks up a presentation and concise assurance summary by receipt ID", async () => {
  const response = await dispatch({ jsonrpc: "2.0", id: 1, method: "aichain_getAvrPresentation", params: [presentation.receiptId] }, { index });
  assert.equal(response.result.receiptId, presentation.receiptId);
  const summary = await dispatch({ jsonrpc: "2.0", id: 2, method: "aichain_getAvrSummary", params: [presentation.receiptId] }, { index });
  assert.equal(summary.result.assuranceLevel, "commitment-only");
  assert.equal((await dispatch({ jsonrpc: "2.0", id: 3, method: "aichain_getAvrSummary", params: [`0x${"ff".repeat(32)}`] }, { index })).error.code, -32004);
});

test("requires explicit enablement and validates method parameters", async () => {
  assert.throws(() => requireLoopbackOptIn({}), /AICHAIN_ENABLE_AVR_RPC=1/);
  assert.doesNotThrow(() => requireLoopbackOptIn({ AICHAIN_ENABLE_AVR_RPC: "1" }));
  assert.equal((await dispatch({ jsonrpc: "2.0", id: 1, method: "aichain_getAvrPresentation", params: [] }, { index })).error.code, -32602);
  assert.equal((await dispatch({ jsonrpc: "2.0", id: 2, method: "aichain_verifyAvrAnchor", params: [presentation.receiptId, 257] }, { index })).error.code, -32602);
});

test("serves JSON-RPC only from an actual local server", async () => {
  const server = createLocalAvrRpcServer({ index });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port, address } = server.address();
  assert.equal(address, "127.0.0.1");
  const body = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "aichain_getAvrSummary", params: [presentation.receiptId] });
  const response = await new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method: "POST", path: "/", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (reply) => {
      let output = ""; reply.on("data", (chunk) => { output += chunk; }); reply.on("end", () => resolve(JSON.parse(output)));
    });
    request.on("error", reject); request.end(body);
  });
  assert.equal(response.result.receiptId, presentation.receiptId);
  await new Promise((resolve) => server.close(resolve));
});
