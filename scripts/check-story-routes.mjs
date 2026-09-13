import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

// Marketing navigation must not depend on the failing client-side Link router.
async function checkNativeLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) await checkNativeLinks(path);
    else if (entry.name.endsWith(".tsx")) {
      assert.doesNotMatch(await readFile(path, "utf8"), /["']next\/link["']/, `${path}: use native page links`);
    }
  }
}
await checkNativeLinks(new URL("../app/", import.meta.url));

// Moving layers must be whole transparent assets, never cropped backdrop slices.
const receiptSource = await readFile(new URL("../app/living-receipt.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.ok(receiptSource.includes('/glass-wafer-alpha.png'));
assert.ok(!receiptSource.includes('/living-receipt-hero.png'));
assert.doesNotMatch(styles, /\.slice-[012]\s*\{[^}]*clip-path/s);

// Read-only smoke checks against the local development preview.
const origin = process.argv[2] || "http://localhost:3000";
const expectations = {
  "/": ["Autonomous agents", 'href="/vision"', "THE LIVING RECEIPT", "Explore authority", "glass-wafer-alpha.png"],
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
