# Commercialisation gap analysis

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

14 September 2026 · v1 · Scope: existing source and documented evidence, not an independent security audit

## Assessment

**The implementation is directionally compatible with the business. The missing layer is mostly productisation and reliable operations above the existing protocol.** The general receipt format can already describe selected AI events without publishing private evidence. Contract anchoring, batched inclusion, signing, authority prototypes, scoped policy proofs and local indexing provide a useful foundation.

The end-to-end managed product in the brief is not present. A local JSON-RPC reference sidecar is not a customer API, locally importable modules are not a published SDK, an illustrative website is not a SaaS application, and internal test transactions are not customer adoption.

Source paths below are relative to `C:\AIChain` unless prefixed `workspace:`. The reviewed active commit is `17bf7914413604917ce26e1051680d8f5cce8ded`; Core-Geth is `59ba79d84681ef1e70ecbf9b179133496ac71a59`. See [review scope](review-scope.md) for coverage and limitations.

## 1. Current blockchain architecture

Core-Geth supplies the EVM and ordinary Ethereum transaction/RPC surfaces. The initial development network used temporary Ethash. Project-specific KawPoW seal verification and a development ASERT profile live in `node/core-geth/consensus/kawpowengine/`, with external GPU work submission and opt-in development activation. `difficulty.go` permits 5/10/15-second targets with a 1,800-second half-life. The selected test profile is 10 seconds; these are not frozen mainnet parameters.

Evidence includes source vectors, GPU interoperability, difficulty simulations, network recovery exercises and bounded load runs under `benchmarks/`, `scripts/` and `docs/phase-2a-*`. Standard EVM anchoring contracts make the verification feature largely independent of consensus modifications. The GPU performs consensus work; it is not running every customer's AI inference or checking whether model answers are true.

## 2. Phase reconciliation

| Existing phase | Recorded state | Supports the new purpose | Remaining work / changed assumption |
|---|---|---|---|
| 0: foundations | Architecture and decision framework exist | Defined change boundaries and gates | Add business outcomes and product ownership without invalidating ADR history |
| 1A: development L1 | Development network and tooling documented | EVM transactions and node operation | Temporary Ethash settings are not launch settings |
| 1B: AVR vertical slice | Development validation complete | Receipt commitments, signing, authority, batch anchors | Alpha semantics and independent integration gates remain |
| 2A: PoW/network | NVIDIA and ASERT development evidence; KawPoW selected for development | GPU security direction retained | AMD, independent operators, full fault/load/soak matrix and production consensus decisions |
| 2B: proof claim | ZK-001 deterministic policy statement defined | Precise optional policy verification | Does not establish AI truth or provider execution |
| 2C: proof stack | RISC Zero initial selection; SP1 comparison; alpha verifier/batching decisions | Working proof path can be reused | Independent review, deployment configuration and production proof economics |
| 2D: receipt product | General 0.4 alpha, presentation 0.3, local RPC/indexer/queue | Much of the developer foundation already exists | Published packages, custody durability, full typed checks, external trial and live general-format validation |
| 3: integrated alpha | Latest sign-off dated 13 September says passed with limitations | Real integrated receipt/proof/governance evidence | Does not close general receipt public readiness, Phase 4 or customer gates |
| 4: closed testnet | Foundation, policies, manifest/metrics/fault validators and rehearsals | Operational backbone for private product trials | No complete acceptance evidence established; retain full exit requirements |
| 5: public testnet | Planned | Future external miners, nodes, faucet, direct developers | Requires Phase 4 acceptance and public-service security review |
| 6: mainnet readiness | Planned | Durable public trust layer and production fee settlement | Consensus/economics, security, operational and legal release gates remain |
| Asset/bridge track | Separate, unselected | Optional future commercial applications | Not needed to prove the verification MVP; defer |

The website's phases 1–3 are visual/content delivery phases, not network milestones. They must use a `WEB` prefix in future planning. The revised product milestones use `P0–P5` and do not relabel historical engineering phases.

## 3. What “end of Phase 4” actually means here

`docs/phase3-signoff-tracker.md` is newer than roadmap paragraphs still saying Phase 3 is active. It records a bounded 300-second workload, 32,080 logical receipts and 106.9 logical receipts/s, as well as proof/governance and restart evidence. These are documented historical results; this review did not reproduce those remote experiments.

The three-NVIDIA-host run is useful interoperability evidence. It does not establish AMD support, independent ownership/control, the full validator topology or a completed 24-hour acceptance run. `docs/phase-4-closed-testnet-foundation.md` still describes preparation, and `config/phase4-acceptance-policy-v0.1.0-draft.json` requires 86,400 seconds and explicit acceptance thresholds.

The defensible status is **Phase 3 signed off with limitations; Phase 4 foundation active and exit unverified**. Reconcile old headers and checklists through a dated status update; do not reinterpret “synthetic” fixtures as measured results. A checked configuration is not a successful network experiment.

## 4. Capability matrix

| Capability | Inspected evidence | Reuse / gap | Priority |
|---|---|---|---|
| General event receipts | `sdk/{python,typescript}/verification_receipt*` / `verification-receipt*`; `spec/verification-receipt/` | Reuse 0.4 envelope, profiles, destination binding and private openings | P0 |
| AI-specific legacy receipts | `receipt.*`, `authorised-receipt.*`, legacy fixtures | Preserve 0.1/0.2 hashes and semantics | P0 |
| Evidence commitments | Exact-byte and salted hashing, streaming functions | Durable evidence/salt storage and canonical object adapter still needed | P0 |
| Individual anchors | `contracts/avr-anchor/src/AVRAnchor.sol` | Caller becomes issuer; restrict managed relayer assumptions | P0 |
| Batch anchors | `ReceiptBatchAnchor.sol`; receipt batch/indexing tools | Existing relay-compatible primitive; retain manifest and per-leaf proof | P0 |
| Authority | `AuthorityRegistry.sol`, historical registry/anchor and audit helpers | Development prototype; general format does not inherit legacy authority proof | P1 |
| ZK | `AVRProofVerifierRegistry.sol`, RISC Zero adapter and ZK-001 sources | Optional specific deterministic policy proof, not general execution proof | P1 |
| Python SDK | Local modules/CLI/tests, exact-byte receipt functions | Missing published packaging, HTTP transport, full signing/recovery and chain client | P0 |
| TypeScript SDK | CommonJS JS modules, declarations for general receipts, tests | Already substantial; private prototype package needs distribution/support | P1 |
| Go | Authorised receipt and policy statement references | Conformance aid; general receipt parity is not established | P2 |
| API | `avr-rpc-server.js` with six `aichain_*` read/verify/info methods | Loopback only, max 1,024 indexed presentations, no customer submit/account API | P0 |
| Indexer | `avr-event-indexer.js`, tests and durable indexer doc | Reuse reorg logic; production persistence, scale, isolation and recovery need proof | P0 |
| Ingress | `avr-ingress-queue.js` in-memory alpha policy | Reuse bounds/dedupe concepts, add durable outbox/worker and reconciliation | P0 |
| Explorer | `deploy/blockscout/`; `avr-explorer-view.js` | Private Blockscout spike and safe local view, not a public receipt explorer product | P1 |
| Organisation audit | Ledger, disclosure and historical audit prototypes | Reuse concepts; no hosted tenant RBAC/evidence service established | P1 |
| Framework adapters | No named framework integration found in first-party tracked code | Generic Python first; OpenAI Agents candidate next | P1 |
| Customer platform | No tenant, account, API-key, billing or metering service found | Build a lean service; do not expose the prototype sidecar | P0 |
| Website | `workspace:site/app/*` and prior `strategy/*` | Strong visual/story base; positioning and conversion revision needed | P0 |
| Website database | `workspace:site/db/schema.ts` is empty | Starter auth/DB files are not customer identity or pilot intake | P1 |
| Adoption/commercial | Prior pitch/whitepaper plans | No confirmed customers, paid contracts or traction dataset established | P0 |

## 5. Architecture change classification

| Proposed change | Layer | Consensus change? | Disposition |
|---|---|---|---|
| Python package, API authentication, billing and export | Company/developer platform | No | Build above stable interfaces |
| Durable outbox, batch worker and reorg-aware status | Service/indexer | No | Reuse receipt identity and chain event contracts |
| Customer-signed receipts in company-submitted batches | SDK/service and existing batch contract | No, within tested existing semantics | Preferred managed MVP path; validate live before release |
| Operator submits individual anchors while claiming customer issuer | Signature/contract semantics | Not supported as a transparent wrapper | Use batches, customer direct submission, or a separately reviewed relayer contract |
| Support general receipts with legacy ZK/authority claims | Proof/profile/contract binding | Not necessarily consensus, but a new security interface | New versioned statement/adapter and tests before claiming support |
| Public receipt lookup and export | Indexer/explorer | No | Publish allow-listed fields and explicit per-check results |
| New receipt version/encoding | Application protocol | Usually no L1 change | ADR, version negotiation and cross-language golden vectors |
| New anchor/verifier contract | EVM application protocol | Normally no L1 consensus change | Contract review, deployment registry and historical support |
| PoW activation, difficulty, rewards or issuance | L1/genesis/economics | Yes or network-defining configuration | Existing engineering gates and separate release decision |
| Mandatory proof verification in transaction validity | L1 consensus | Yes | Not required for this MVP |
| Recursive proofs, rollups, bridge | New protocol/application architecture | Depends on design | Defer; no commercial-MVP dependency |

## 6. Important security and product gaps

1. **Identity separation:** issuer, human approver, organisation and gas-paying relayer are different roles. A customer's API key must not silently become its cryptographic identity.
2. **Durability before acceptance:** persist the original event ID, receipt bytes, salts/openings and idempotency mapping before returning durable acceptance. A process restart must not generate new receipt identities or lose evidence.
3. **Assurance is multidimensional:** inclusion, evidence integrity, signature, identity, authority, policy proof and human review need separate results. Unsupported is not passed.
4. **Privacy extends beyond prompts:** profile names, issuer addresses, event timing and batch manifests can reveal commercial relationships. Keep context private and explicitly review every public field.
5. **Reorg handling:** revoke stale confirmation views, preserve historical observations and re-anchor only the same commitment. A retry cannot create a second usage charge.
6. **Untrusted content:** commitment storage does not make uploaded URLs, documents or API requests safe. Evidence processing requires size/type limits, restricted fetching and tenant isolation.
7. **Proof resource isolation:** use separate quotas, bounded queues and versioned verifier allow-lists. Proof requests must not starve ordinary receipt submission.
8. **Open verification:** exported receipts and inclusion proofs must remain useful outside company accounts; a company's own RPC view alone is not strong independence evidence.

## 7. Dependencies and immediate parallel work

SDK packaging, API contract design, typed result definitions, customer interviews, site copy and commercial modelling can start immediately after roadmap review. Durable worker implementation depends on stable receipt identity and the sponsor-signature decision. Live partner submission depends on private environment approval and reliable custody. Public onboarding depends on Phase 4 acceptance and public gateway hardening. Production commitments depend on the separate production-network gate.

The first implementation should use an existing receipt profile and existing batch anchor, not modify mining or invent a new receipt schema. The [architecture](03-product-architecture.md), [MVP contract](04-mvp-and-api-contract.md) and [roadmap](02-roadmap-and-swimlanes.md) define acceptance tests and responsible lanes.
