# Repository structure and safe migration

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

## Accepted near-term structure — 20 September 2026

The [fresh repository audit](C:/AIChain/docs/archive/2026-09-27/superseded-plans/base-transition-audit-and-roadmap.md) supersedes the proposed physical moves below. Reuse `C:\AIChain` and its current `contracts`, `sdk`, `spec`, `fixtures` and CI paths. `C:\AIChain\website` is already a separate Git repository with its own remote; preserve its path and deployment. Do not add that nested repo as ordinary files to AIChain. Keep the older OneDrive checkout as business/planning context, not product source. Preserve the miner repo and Core-Geth submodule as research history. No new clone or directory-wrapper migration is required. The old `site/` references below are historical and no longer describe the active website home.

14 September 2026 · Structure established for planning; runtime migration proposed

## Current facts

`C:\AIChain` is the active Git repository containing the protocol, contracts, SDKs, fixtures, tests and operational scripts. Its Core-Geth source is a submodule with project-specific commits. This workspace, `C:\Users\mjgra\OneDrive\Documents\ChatGPT\New Dag`, is an older incomplete tracked checkout containing the current website and business material. Its deleted tracked protocol files pre-date this review. Do not restore or stage those deletions as part of documentation work.

`site/` is the current website application, with deployment-related metadata and archived tarballs. `strategy/` contains prior website/brand planning. Root tarballs and rendered assets are snapshots, not authoritative source. The new `business/`, `development/` and `website/` folders establish separate ownership now without breaking builds.

## Recommended target

Use a coordinated project with a public engineering repository and a private business repository when customer or financing records appear. A monorepo can still organise the public-safe product source if the team prefers it. Do not publish this workspace wholesale: it contains an old checkout, archives and business planning that need selection and review.

Proposed public-safe monorepo layout, after migration review:

```text
project/
  README.md
  development/
    node/core-geth/             # retain gitlink and upstream provenance
    contracts/
    sdk/python/
    sdk/typescript/
    sdk/go/
    integrations/
    services/verification-api/
    services/submission-worker/
    services/indexer/
    spec/
    fixtures/
    examples/
    tests/
    config/
    deploy/
    scripts/
    benchmarks/
    docs/decisions/
  website/
    app/                       # whole current site application root
    content/                   # approved copy, claims and content briefs
  business/
    public-strategy/            # sanitised positioning/programme only
  .github/workflows/
```

Keep CRM, contracts, finance, customer evidence, real key inventories and confidential grant/investor material outside the public repository. Select licensing per component after the license/IP review; Solidity SPDX labels or public availability do not establish rights for every SDK, node dependency or brand asset.

## Practical near-term mapping

| Area | Authoritative location now | Target after approved migration |
|---|---|---|
| Node, contracts, scripts, config | `C:\AIChain` existing paths | `development/` in chosen source repository |
| SDKs and schemas | `C:\AIChain\sdk`, `spec` | `development/sdk`, `development/spec` |
| New service code | Proposed top-level `services/` in active code first | `development/services/` |
| Website runtime | Workspace `site/` | `website/app/` as a complete app root |
| Website planning | Workspace `website/` | `website/content/` |
| Strategy and business templates | Workspace `business/` | Private business repo; approved public subset only |
| Historical design/ADR records | Existing source `docs/` | Preserve history under `development/docs/` |
| Archives/builds/caches | Existing snapshot paths | Inventory then retention decision; no source duplication |

The extra `website/app/app/` that results from moving a Next-style application root is mechanically valid but potentially confusing. At migration time name the whole app root `website/site/` if clearer; preserve its internal routing directory. Do not flatten framework directories merely for appearance.

## Migration sequence

1. Confirm which remote owns engineering and which owns the website. Record current branches, uncommitted changes, submodule SHAs and deployment root. Do not infer that the older checkout is the latest source.
2. Select a clean branch/worktree in the authoritative repository. Record baseline test commands and build results. Keep credentials, caches, devnet state and runtime logs out of the migration.
3. Move business/website planning first using a manifest of source/destination hashes. Confirm no confidential document enters a public remote.
4. Move the complete website root in its own change. Update build root, metadata references, archive scripts and preview/deployment configuration; build, test routes and exercise actual navigation before changing deployment settings.
5. Move engineering paths in a separate reviewed change only if the benefit exceeds path churn. Update `.gitmodules`, scripts, package commands, fixture paths, CI working directories, Foundry configuration, import paths and documentation links together. Prefer repository-root discovery over hardcoded machine paths.
6. Verify a fresh clone with recursive submodules; run receipt language conformance, contract tests, targeted client/build checks and isolated operational harnesses. Validate the website independently. No live node restart is required for a source-directory move.
7. Update developer/runbook links and code ownership. Retain old path redirects where published URLs would otherwise break. Remove compatibility shims only after consumers migrate.
8. Switch deployment roots only through the relevant release process after previews pass. Archive old snapshots only after a retention/rollback decision; never delete running chain data to “clean the repo”.

Rollback is a revert of the migration commit plus restoration of build/deploy root configuration. Database/chain state changes should not be bundled with a folder move. Verify resolved absolute paths before any recursive move or deletion on Windows.

## Documentation authority and maintenance

The project hub points to one strategy, one roadmap and one status ledger. Detailed ADRs own protocol meaning. Dated experiment reports own measured results. A website claim must cite a source revision. A historic roadmap header is not a current release record.

The active repository receives a small [commercialisation handoff](<C:/AIChain/docs/archive/2026-09-27/superseded-plans/commercialisation-review-handoff.md>) so future engineering work can find this package. It is a local navigation bridge, not a portable public documentation dependency. Replace that absolute workspace pointer with committed repository links when the documentation home is selected.

The inventory generator is read-only with respect to active code. Its outputs distinguish automated text scanning from detailed review and avoid dependency/cache/secret contents. Re-run `node development/tools/inventory-project.mjs C:/AIChain` to refresh the source map after changes.
