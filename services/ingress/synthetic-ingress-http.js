#!/usr/bin/env node
// Local HTTP wrapper for the synthetic-only ingress service. No signing or relay.
const http = require('node:http');
const path = require('node:path');
const { SyntheticIngressService } = require('./synthetic-ingress-service');
const { BaseSepoliaSyntheticBatchAdapter } = require('../../sdk/typescript/base-sepolia-batch-adapter');

function json(response, status, body) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(`${JSON.stringify(body)}\n`); }
async function body(request) {
  let input = ''; for await (const chunk of request) { input += chunk; if (input.length > 1_000_000) throw new Error('request-too-large'); }
  return input ? JSON.parse(input) : {};
}
function createSyntheticIngressHttpServer({ ingress, logger = () => {} }) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return response.end(`<!doctype html><title>AIChain synthetic ingress</title><style>body{max-width:700px;margin:48px auto;font:16px system-ui;color:#17212b}code{background:#f1f5f9;padding:2px 4px}</style><h1>AIChain synthetic ingress</h1><p>This is a local, synthetic-only development service.</p><pre id="status">Loading health status…</pre><p>Health JSON: <a href="/health">/health</a></p><script>const output=document.getElementById('status');fetch('/health').then(r=>r.json()).then(v=>output.textContent=JSON.stringify(v,null,2)).catch(e=>output.textContent='Health check failed: '+e.message)</script>`);
      }
      if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, ingress.health());
      const apiKey = request.headers['x-aichain-api-key'];
      const input = await body(request);
      if (request.method === 'POST' && url.pathname === '/v1/synthetic/receipts') {
        const result = ingress.submit({ apiKey, synthetic: input.synthetic, presentation: input.presentation });
        logger({ event: 'synthetic-receipt-submission', status: result.status, receiptId: result.receiptId ?? null });
        return json(response, result.accepted ? 202 : result.status === 'unauthorized' ? 401 : 400, result);
      }
      if (request.method === 'POST' && url.pathname === '/v1/synthetic/batches/prepare') {
        const result = ingress.prepareNext({ apiKey, force: input.force === true });
        logger({ event: 'synthetic-batch-prepared', status: result.status, queueBatchId: result.queueBatchId ?? null, receiptCount: result.receiptIds?.length ?? 0 });
        return json(response, result.status === 'unauthorized' ? 401 : 200, result);
      }
      const match = url.pathname.match(/^\/v1\/synthetic\/batches\/([^/]+)\/result$/);
      if (request.method === 'POST' && match) {
        const result = ingress.reconcile({ apiKey, queueBatchId: match[1], result: input.result });
        logger({ event: 'synthetic-batch-reconciled', status: result.status, queueBatchId: match[1] });
        return json(response, result.status === 'unauthorized' ? 401 : result.status === 'recorded' ? 200 : 404, result);
      }
      return json(response, 404, { status: 'not-found' });
    } catch (error) { logger({ event: 'synthetic-ingress-error', reason: error.message }); return json(response, 400, { status: 'bad-request', reason: error.message }); }
  });
}
function startFromEnv() {
  const apiKey = process.env.AICHAIN_SYNTHETIC_API_KEY;
  if (!apiKey) throw new Error('Set AICHAIN_SYNTHETIC_API_KEY before starting the synthetic ingress service');
  const stateFile = process.env.AICHAIN_SYNTHETIC_STATE_FILE ?? path.resolve(process.cwd(), 'build', 'base-sepolia', 'synthetic-ingress-state.json');
  const integerEnv = (name, fallback) => process.env[name] === undefined ? fallback : Number(process.env[name]);
  const queuePolicy = { maxBatchReceipts: integerEnv('AICHAIN_SYNTHETIC_MAX_BATCH_RECEIPTS', 1_000), maxQueueReceipts: integerEnv('AICHAIN_SYNTHETIC_MAX_QUEUE_RECEIPTS', 10_000) };
  const ingress = new SyntheticIngressService({ apiKey, stateFile, queuePolicy, adapter: new BaseSepoliaSyntheticBatchAdapter({ contract: '0x5781540E4682A9D35011C94A25F615e438E8E7aF', publisher: '0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3' }) });
  const port = Number(process.env.AICHAIN_SYNTHETIC_INGRESS_PORT ?? 8787);
  createSyntheticIngressHttpServer({ ingress, logger: event => console.log(JSON.stringify({ at: new Date().toISOString(), ...event })) }).listen(port, '127.0.0.1', () => console.log(`Synthetic ingress listening on http://127.0.0.1:${port}`));
}
if (require.main === module) startFromEnv();
module.exports = { createSyntheticIngressHttpServer };
