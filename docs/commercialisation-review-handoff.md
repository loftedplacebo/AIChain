# Commercialisation strategy handoff — 14 September 2026

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
