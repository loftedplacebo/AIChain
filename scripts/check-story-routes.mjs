import assert from "node:assert/strict";

// Read-only smoke checks against the local development preview.
const origin = "http://localhost:3000";
const expectations = {
  "/": ["Autonomous agents", 'href="/vision"'],
  "/product": ["A focused review package", "The application enforces."],
  "/in-action": ["Path A / Accepted", "Path B / More evidence", "Path C / Rejected", "The evidence cannot be retrieved.", "Not granted by this review"],
  "/use-cases": ["Path C / Rejected", "product story, not a live customer result"],
  "/vision": ["More freedom to act.", "First focus", "Longer-term ambition", "emergency stops"],
  "/technology": ["Six checks"],
  "/technical": ["Six checks"],
  "/developers": ["0.4.0-alpha"],
  "/whitepaper": ["full whitepaper is being developed"],
  "/status": ["Project status"],
};

for (const [route, phrases] of Object.entries(expectations)) {
  const response = await fetch(`${origin}${route}`);
  assert.equal(response.status, 200, route);
  const html = (await response.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.match(html, /<h1\b/, `${route}: missing main heading`);
  for (const phrase of phrases) assert.ok(html.includes(phrase), `${route}: missing ${phrase}`);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/\bhref="#([^"]+)"/g)) {
    assert.ok(ids.has(match[1]), `${route}: unresolved anchor #${match[1]}`);
  }
  assert.ok(!html.includes("hello@orvessian.com"), `${route}: invented email`);
  console.log(`${route}: status, content and local anchors passed`);
}
