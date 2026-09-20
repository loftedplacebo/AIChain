# Commercialisation strategy handoff — 14 September 2026

## Accepted pivot — 20 September 2026

The founder has now accepted Base for launch and evaluation of larger/hierarchical batching. [ADR-0009](decisions/0009-base-launch-settlement.md) records the decision; [the repository audit and revised roadmap](base-transition-audit-and-roadmap.md) are the current technical source of truth. This supersedes the pending-recommendation language in the earlier review below. Reuse engineering and the separate website repos in place; no wallet creation or live miner shutdown has yet occurred.

## 20 September architecture decision review

The in-depth settlement analysis, retained in the private business workspace, recommends launching the verification product on one established public EVM network, with no planned own-L1 migration. This revises the earlier proposed priority of continuing miner development alongside product delivery. It is a recommendation awaiting recorded adoption; no running network, consensus setting, contract deployment or receipt format was changed.

Implementation priorities are: settle context-bound receipt/version rules before SDK freeze; harden public batch anchoring and sender/issuer semantics; implement network-specific finality; persist accepted work and batch proofs durably; provide independent exports. Compare Base and Arbitrum One through one reusable EVM integration slice, then operate one production destination. Existing own-network release gates remain applicable if that network is released. Current NVIDIA/CUDA Phase 4 scope is preserved; no new AMD or miner expansion is scheduled by this review.

Fresh evidence: 27 local tests across general receipts, anchor verification, ingress queue and presentations pass on 20 September. These are not external-chain deployments or production security evidence. Capacity/cost scenarios and their executable calculation are linked from the analysis. The prior hashrate-shock/economic work package remains a plan, not completed simulations.

## Earlier strategy handoff

The founder has supplied a new direction: build an open independent AI verification network with a commercial SDK/API and evidence platform above it. The first review preserves existing consensus, receipt formats, contracts and release gates.

The cross-project proposal lives in the associated local website/business workspace:

- [Project hub](<C:/Users/mjgra/OneDrive/Documents/ChatGPT/New Dag/PROJECT.md>)
- [Commercialisation gap analysis](<C:/Users/mjgra/OneDrive/Documents/ChatGPT/New Dag/development/01-commercialisation-gap-analysis.md>)
- [Roadmap and swim lanes](<C:/Users/mjgra/OneDrive/Documents/ChatGPT/New Dag/development/02-roadmap-and-swimlanes.md>)
- [Architecture alignment](<C:/Users/mjgra/OneDrive/Documents/ChatGPT/New Dag/development/03-product-architecture.md>)

These are local navigation links, not published documentation URLs. The repository-structure proposal defines how to establish portable source homes without copying stale protocol code or breaking existing paths.

Current evidence: the latest [Phase 3 sign-off](phase3-signoff-tracker.md) records completion with limitations; [Phase 4 foundations](phase-4-closed-testnet-foundation.md) do not establish full closed-testnet exit. Older roadmap headings lag that sign-off. Reconcile status against evidence rather than treating an old heading as authoritative.

The proposed next product increment is a Python-first managed selected-event path with durable evidence/outbox, typed verification results, customer-signed receipts, existing relayed batch anchoring and independently verifiable export. Most work belongs above the existing EVM interfaces. The current individual anchor verifier requires issuer/sender agreement, so a company relayer must not silently impersonate a customer issuer.

The source request calls for roadmap review before large-scale implementation. This handoff is a proposal pointer, not a new accepted ADR or launch authorisation. No consensus, genesis, allocation, reward, production network, public endpoint or contract deployment changes are included.
