// Development-only AVR JSON-RPC sidecar.
// It is deliberately separate from Core-Geth and only listens on 127.0.0.1
// when AICHAIN_ENABLE_AVR_RPC=1 is explicitly supplied.

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { JsonRpcProvider } = require("ethers");
const { assuranceSummary, validatePresentation } = require("./avr-presentation");
const { verifyPresentationAnchor } = require("./avr-anchor-verifier");

const MAX_BODY_BYTES = 1_048_576;
const MAX_PRESENTATIONS = 1_024;
const MAX_CONFIRMATIONS = 256;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const METHODS = new Set(["aichain_getAvrPresentation", "aichain_getAvrSummary", "aichain_verifyAvrAnchor", "aichain_avrRpcInfo"]);

function rpcError(id, code, message, data = undefined) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error };
}
function rpcResult(id, result) { return { jsonrpc: "2.0", id: id ?? null, result }; }
function normaliseReceiptId(value) { return typeof value === "string" && BYTES32.test(value) ? value.toLowerCase() : null; }

function createPresentationIndex(presentations) {
  if (!Array.isArray(presentations) || presentations.length > MAX_PRESENTATIONS) throw new Error(`presentations must contain at most ${MAX_PRESENTATIONS} entries`);
  const index = new Map();
  for (const presentation of presentations) {
    validatePresentation(presentation);
    const key = presentation.receiptId.toLowerCase();
    if (index.has(key)) throw new Error(`Duplicate receiptId in index: ${presentation.receiptId}`);
    index.set(key, presentation);
  }
  return index;
}

function loadPresentationsDirectory(directory) {
  const resolved = path.resolve(directory);
  const files = fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(resolved, entry.name));
  if (files.length > MAX_PRESENTATIONS) throw new Error(`Presentation directory exceeds ${MAX_PRESENTATIONS} files`);
  return files.map((file) => {
    if (fs.statSync(file).size > MAX_BODY_BYTES) throw new Error(`Presentation file exceeds ${MAX_BODY_BYTES} bytes: ${file}`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  });
}

async function dispatch(request, { index, provider }) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string" || !METHODS.has(request.method)) {
    return rpcError(request?.id, -32601, "Method not found");
  }
  const params = request.params ?? [];
  if (!Array.isArray(params)) return rpcError(request.id, -32602, "Params must be an array");
  if (request.method === "aichain_avrRpcInfo") {
    if (params.length !== 0) return rpcError(request.id, -32602, "aichain_avrRpcInfo accepts no params");
    return rpcResult(request.id, {
      schema: "aichain.avr-rpc", schemaVersion: "0.1.0-draft", developmentOnly: true,
      transport: "loopback-only", methods: [...METHODS].sort(), maxBodyBytes: MAX_BODY_BYTES,
      maxIndexedPresentations: MAX_PRESENTATIONS, rawAiDataAccepted: false
    });
  }
  const receiptId = normaliseReceiptId(params[0]);
  if (!receiptId || params.length < 1) return rpcError(request.id, -32602, "First param must be a bytes32 receiptId");
  const presentation = index.get(receiptId);
  if (!presentation) return rpcError(request.id, -32004, "AVR receipt not indexed");
  if (request.method === "aichain_getAvrPresentation") {
    if (params.length !== 1) return rpcError(request.id, -32602, "aichain_getAvrPresentation accepts one param");
    return rpcResult(request.id, presentation);
  }
  if (request.method === "aichain_getAvrSummary") {
    if (params.length !== 1) return rpcError(request.id, -32602, "aichain_getAvrSummary accepts one param");
    return rpcResult(request.id, assuranceSummary(presentation));
  }
  if (params.length > 2 || (params.length === 2 && (!Number.isInteger(params[1]) || params[1] < 1 || params[1] > MAX_CONFIRMATIONS))) {
    return rpcError(request.id, -32602, `aichain_verifyAvrAnchor accepts receiptId and optional confirmations (1-${MAX_CONFIRMATIONS})`);
  }
  if (!provider) return rpcError(request.id, -32001, "Underlying Ethereum RPC is not configured");
  try {
    return rpcResult(request.id, await verifyPresentationAnchor(presentation, provider, { minimumConfirmations: params[1] ?? 1 }));
  } catch (error) {
    return rpcError(request.id, -32000, "Anchor verification failed", error instanceof Error ? error.message : String(error));
  }
}

function createLocalAvrRpcServer({ index, provider }) {
  if (!(index instanceof Map)) throw new Error("index must be a Map");
  return http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/") {
      response.writeHead(404).end();
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) chunks.push(chunk);
    });
    request.on("end", async () => {
      if (tooLarge) {
        response.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(rpcError(null, -32600, "Request body too large")));
        return;
      }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { payload = null; }
      const result = payload === null ? rpcError(null, -32700, "Parse error") : await dispatch(payload, { index, provider });
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(result));
    });
  });
}

function requireLoopbackOptIn(environment = process.env) {
  if (environment.AICHAIN_ENABLE_AVR_RPC !== "1") throw new Error("Refusing to start: set AICHAIN_ENABLE_AVR_RPC=1 explicitly");
}

async function startLocalAvrRpc({ port = 18645, presentationsDirectory, ethereumRpcUrl = "http://127.0.0.1:8545", environment = process.env } = {}) {
  requireLoopbackOptIn(environment);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("port must be an integer between 1024 and 65535");
  if (!presentationsDirectory) throw new Error("presentationsDirectory is required");
  const index = createPresentationIndex(loadPresentationsDirectory(presentationsDirectory));
  const server = createLocalAvrRpcServer({ index, provider: new JsonRpcProvider(ethereumRpcUrl) });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined;
  const directory = option("--presentations-dir");
  const port = Number(option("--port") ?? 18645);
  const ethereumRpcUrl = option("--ethereum-rpc") ?? "http://127.0.0.1:8545";
  const server = await startLocalAvrRpc({ port, presentationsDirectory: directory, ethereumRpcUrl });
  console.log(`AIChain AVR development RPC listening on http://127.0.0.1:${port}/ (indexed presentations: ${loadPresentationsDirectory(directory).length})`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { MAX_BODY_BYTES, MAX_PRESENTATIONS, METHODS, createPresentationIndex, loadPresentationsDirectory, dispatch, createLocalAvrRpcServer, requireLoopbackOptIn, startLocalAvrRpc };
