# Orvessian website and governance platform

Current review: 27 September 2026. Read [platform baseline](../docs/platform-architecture.md) for implemented, testnet and planned capabilities. `/portal` is a generated synthetic demo; `/workspace` is authenticated and currently connects the local website through SSH to the VPS API; `/explorer` inspects public anchors. `/products/governance-preview` is proposed packaging, not a paid offer.

The local tunnel is 8794 → VPS loopback 8795. API credentials stay server-side; synthetic login details are in the ignored engineering build directory. Public production hosting, SSO, customer onboarding and pricing remain gated. Source edits do not publish the website.

## Documentation

[Seven active guides](../docs/README.md) own current strategy, delivery and operations. See [website messaging](../docs/website-messaging.md), [commercial model](../docs/commercial-model.md) and [historical website planning](docs/archive/README.md).

## Existing development and component notes

# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Standalone Node build probe

Set `ORVESSIAN_NODE_BUILD=1` when building for a VPS. This selects vinext's
standalone output and omits the Sites/Cloudflare Vite plugins. The ordinary
`npm run build` still produces the Site build.

```powershell
$env:ORVESSIAN_NODE_BUILD = '1'
npm run build
$env:HOST = '127.0.0.1'
$env:PORT = '3177'
node dist/standalone/server.js
```

This only proves that the frontend can build and serve on Node. Hosted sign-in
still needs configured HTTPS portal/API routing, WorkOS callbacks and a live
governance API. Keep the Node listener on loopback behind a reviewed TLS proxy.

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Orvessian Base Sepolia explorer alpha

The `/explorer` route is a read-only product preview. It reads chain 84532
through `/api/explorer`, which only permits recent anchor-event scans and
transaction-hash verification against the deployed `ReceiptBatchAnchor`
contract. The default RPC is `https://sepolia.base.org`; deployments may set
`BASE_SEPOLIA_RPC_URL` and `BASE_SEPOLIA_RPC_FALLBACK_URL` to HTTPS Base
Sepolia endpoints. The route tries the configured endpoints sequentially with
a bounded timeout and verifies chain ID 84532 before trusting the response.
The default secondary endpoint is `https://base-sepolia-rpc.publicnode.com`.
These shared public RPC endpoints are rate limited and intended for testing;
use a dedicated provider for production workloads. Keep this testnet-only
route bound to Base Sepolia RPC URLs; it rejects a wrong chain ID.

The public RPC limits `eth_getLogs` to a 1,000-block range, so the current
activity table is intentionally short. Transaction-hash verification can read
an older event directly. Receipt-level Merkle membership still requires the
off-chain batch manifest, which the browser accepts for local verification;
the explorer does not show private evidence.

After verifying an anchor transaction, the page also lets a user select its
AVR batch manifest JSON and check one receipt ID locally. The browser caps the
file at 2 MB and manifests at 10,000 receipt IDs, recomputes the Ethereum
Keccak Merkle root and membership proof, then compares batch ID, root,
publisher, leaf count and schema version with the verified Base Sepolia event.
The manifest is read in the browser and is not uploaded to `/api/explorer`.
This alpha check proves identifier membership only; it does not validate the
receipt body, evidence provenance, model behavior or safety.

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
