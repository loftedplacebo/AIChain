import assert from "node:assert/strict";
import test from "node:test";

async function request(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html,application/json" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} }
  );
}

test('customer workspace renders a session boundary and anonymous data access fails closed',async()=>{
 const page=await request('/workspace');assert.equal(page.status,200);assert.match(await page.text(),/Checking your session/);
 const response=await request('/api/workspace?action=report&workspace=another-customer');
 assert.equal(response.status,403); // Test host localhost differs from explicitly configured development origin/port.
 assert.match(response.headers.get('cache-control'),/no-store/);
});

test("server-renders the Orvessian homepage and links to the explorer", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Orvessian \| AI governance and verification<\/title>/);
  assert.match(html, /href="\/explorer"/);
  assert.match(html, /A governance workspace for AI activity, outcomes and independently checkable evidence/);
});

test("server-renders the Base Sepolia explorer and its evidence boundary", async () => {
  const response = await request("/explorer");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Base Sepolia Explorer \| Orvessian<\/title>/);
  assert.match(html, /Check the public anchor/);
  assert.match(html, /Verify transaction/);
  assert.match(html, /membership/);
  assert.match(html, /Base Sepolia/);
});

test("rejects malformed transaction hashes before contacting the RPC", async () => {
  const response = await request("/api/explorer?tx=0x1234");
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid 32-byte transaction hash/);
});

test("governance portal renders labelled demo controls and plans disclose indicative pricing", async () => {
  const portal=await request('/portal');assert.equal(portal.status,200);const html=await portal.text();
  assert.match(html,/Interactive product preview/);assert.match(html,/All activity is synthetic/);assert.match(html,/Model deployment/);assert.match(html,/Reports/);
  const pricing=await request('/products/governance-preview');assert.equal(pricing.status,200);const offer=await pricing.text();
  assert.match(offer,/Indicative launch pricing/);assert.match(offer,/£99 \/ month/);assert.match(offer,/£990 billed annually/);assert.match(offer,/From £999 \/ month/);assert.match(offer,/No token purchase or wallet/);
  assert.match(offer,/Paid plans, public API onboarding and production service are not available yet/);
  assert.match(offer,/Compare scope and availability/);
  assert.match(offer,/href="\/portal"/);assert.match(offer,/href="\/product"/);assert.match(offer,/href="\/status"/);
  const products=await request('/products');assert.equal(products.status,200);const plans=await products.text();
  for(const tier of ['Evaluate','Operate','Enterprise']) assert.ok(plans.includes(tier));
  assert.match(plans,/Indicative launch pricing/);assert.match(plans,/100,000 events per month/);assert.match(plans,/£10 per additional 10,000 events/);
});

test('demo exports are labelled synthetic, downloadable and use the selected cohort',async()=>{
 const response=await request('/api/governance-demo-report?days=7&deployment=claims-model-v2');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);
 const report=await response.json();assert.equal(report.synthetic,true);assert.equal(report.report.models.length,1);assert.equal(report.report.models[0].deployment,'claims-model-v2');assert.ok(report.report.definitions.accuracy.formula);
 const csv=await request('/api/governance-demo-report?days=14&format=csv');assert.match(csv.headers.get('content-type'),/text\/csv/);assert.match(await csv.text(),/claims-model-v1/);
 assert.equal((await request('/api/governance-demo-report?days=99')).status,400);
});
