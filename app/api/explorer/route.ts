import { BASE_SEPOLIA_FALLBACK_RPC_URL, BASE_SEPOLIA_RPC_URL, getRecentAnchors, rpcRequestWithFallback, TX_HASH_PATTERN, verifyAnchorTransaction } from "../../../lib/base-sepolia-explorer.js";

export const dynamic = "force-dynamic";

type WindowState = { startedAt: number; count: number };
const requestWindows = new Map<string, WindowState>();
const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 45;
const MAX_TRACKED_CLIENTS = 2_000;

function json(body: unknown, status = 200, cache = "no-store") {
  return Response.json(body, { status, headers: { "cache-control": cache, "x-content-type-options": "nosniff" } });
}

function withinLimit(request: Request) {
  const key = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "shared-development-client";
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current && requestWindows.size >= MAX_TRACKED_CLIENTS) {
    for (const [client, window] of requestWindows) if (now - window.startedAt >= WINDOW_MS) requestWindows.delete(client);
    if (requestWindows.size >= MAX_TRACKED_CLIENTS) return false;
  }
  if (!current || now - current.startedAt >= WINDOW_MS) requestWindows.set(key, { startedAt: now, count: 1 });
  else if (current.count >= REQUESTS_PER_WINDOW) return false;
  else current.count += 1;
  if (requestWindows.size > MAX_TRACKED_CLIENTS) {
    for (const [client, window] of requestWindows) if (now - window.startedAt >= WINDOW_MS) requestWindows.delete(client);
  }
  return true;
}

const rpcEndpoints = [
  process.env.BASE_SEPOLIA_RPC_URL || BASE_SEPOLIA_RPC_URL,
  process.env.BASE_SEPOLIA_RPC_FALLBACK_URL || BASE_SEPOLIA_FALLBACK_RPC_URL
];
const rpc = (method: string, params: unknown[] = []) => rpcRequestWithFallback(method, params, { urls: rpcEndpoints });

export async function GET(request: Request) {
  if (!withinLimit(request)) return json({ error: "Too many explorer requests. Wait a minute and try again." }, 429, "no-store");
  const tx = new URL(request.url).searchParams.get("tx");
  if (tx !== null) {
    if (!TX_HASH_PATTERN.test(tx)) return json({ error: "Enter a valid 32-byte transaction hash." }, 400, "no-store");
    try {
      return json(await verifyAnchorTransaction(tx, rpc), 200, "public, max-age=3, s-maxage=3, stale-while-revalidate=3");
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Base Sepolia verification failed." }, 502, "no-store");
    }
  }
  try {
    const activity = await getRecentAnchors(rpc);
    return json(activity, 200, "public, max-age=15, s-maxage=30, stale-while-revalidate=30");
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Base Sepolia is temporarily unavailable." }, 502, "no-store");
  }
}
