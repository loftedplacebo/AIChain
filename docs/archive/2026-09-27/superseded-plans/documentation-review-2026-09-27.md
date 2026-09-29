# Documentation review — 27 September 2026

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

## Scope and authority

Reviewed authored Markdown across engineering documentation, governance service, website brand/commercial notes and the business/development/website/strategy hub, plus website routes and implementation. Inventory: 136 Markdown documents (148860 words scanned). This is a documentation and claims review, not a security, legal or capacity audit. Generated binaries, secrets, vendored code and original DOCX research are not rewritten.

Authority: [Platform state](../../../platform-architecture.md), current runbooks and validation artifacts. Historical experiments retain dates and technical semantics; proposed features do not become implemented through a status banner. Primary strategy, commercials, status and roadmap are rewritten around current delivery; older designs carry explicit precedence notices.

## Material findings and corrections

- Own-PoW/GPU launch claims replaced on entry points and website by accepted Base application direction.
- Governance workspace, public synthetic demo and public anchor explorer have distinct boundaries.
- Recorder signatures are distinct from source authenticity, correctness, complete capture, runtime safety and Ethereum finality.
- SQLite VPS is distinguished from locally validated PostgreSQL; scheduled production backups remain unimplemented.
- Private VPS API via SSH is distinguished from public production hosting.
- The 24-hour soak is in progress; 2,400 records is not million/day evidence.
- Retired numeric prices, token incentives and source-content custody removed from current commercial direction; marketplace remains research.
- Historical mining/protocol records are retained with a scope notice, not rewritten as current release gates.

## Publication and follow-up

Website changes are source/local-preview updates; public publication is not performed. Public repository links may lag uncommitted local work. On soak completion update current status only after event/job/chain reconciliation. Before customer onboarding resolve identity, environments, custody, retention, backup/restore, costs and security gates.

## Reviewed Markdown inventory

| Area | Document | Treatment |
|---|---|---|
| engineering/website | docs/ai-verification-and-zk-architecture.md | Current reference / technical contract / dated validation |
| engineering/website | docs/aichain-kawpow-miner-packaging.md | Historical evidence; launch scope clarified |
| engineering/website | docs/authenticated-customer-workspaces.md | Current reference / technical contract / dated validation |
| engineering/website | docs/authorised-avr-prototype.md | Current reference / technical contract / dated validation |
| engineering/website | docs/autonomous-machines-product-vision.md | Current reference / technical contract / dated validation |
| engineering/website | docs/avr-prototype-specification.md | Current reference / technical contract / dated validation |
| engineering/website | docs/base-sepolia-capacity-baseline.md | Current reference / technical contract / dated validation |
| engineering/website | docs/base-sepolia-deployment-runbook.md | Current reference / technical contract / dated validation |
| engineering/website | docs/base-sepolia-ingress-alpha.md | Current reference / technical contract / dated validation |
| engineering/website | docs/base-sepolia-relayer-load-runbook.md | Current reference / technical contract / dated validation |
| engineering/website | docs/base-transition-audit-and-roadmap.md | Current reference / technical contract / dated validation |
| engineering/website | docs/blockscout-compatibility-spike.md | Current reference / technical contract / dated validation |
| engineering/website | docs/capacity-and-batching-prototype.md | Current reference / technical contract / dated validation |
| engineering/website | docs/closed-synthetic-testnet-runbook.md | Current reference / technical contract / dated validation |
| engineering/website | docs/commercialisation-review-handoff.md | Current reference / technical contract / dated validation |
| engineering/website | docs/core-l1-architecture-and-tooling.md | Historical evidence; launch scope clarified |
| engineering/website | docs/customer-audit-portal-decisions.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0001-core-geth-development-baseline.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0002-organisational-verification-ledger.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0003-evm-native-pow-header-compatibility.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0004-kawpow-phase-2a-development-selection.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0005-zk-001-policy-evaluation-statement.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0006-risc-zero-initial-proof-stack-selection.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0007-zk-003-individual-proof-batches.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0008-zk-004-verifier-governance-and-limits.md | Current reference / technical contract / dated validation |
| engineering/website | docs/decisions/0009-base-launch-settlement.md | Current reference / technical contract / dated validation |
| engineering/website | docs/deployments/base-sepolia-receipt-batch-anchor-2026-09-20.md | Current reference / technical contract / dated validation |
| engineering/website | docs/development-environments.md | Current reference / technical contract / dated validation |
| engineering/website | docs/development-plan.md | Current reference / technical contract / dated validation |
| engineering/website | docs/examples/customer-ai-decision-audit-example.md | Current reference / technical contract / dated validation |
| engineering/website | docs/future-proof-organisational-verification-architecture.md | Current reference / technical contract / dated validation |
| engineering/website | docs/governance-analytics-portal-architecture.md | Current reference / technical contract / dated validation |
| engineering/website | docs/governance-automated-worker.md | Current reference / technical contract / dated validation |
| engineering/website | docs/governance-development-status.md | Current reference / technical contract / dated validation |
| engineering/website | docs/governance-postgres-native-validation.md | Current reference / technical contract / dated validation |
| engineering/website | docs/governance-receipt-base-integration.md | Current reference / technical contract / dated validation |
| engineering/website | docs/governance-storage-and-environments.md | Current reference / technical contract / dated validation |
| engineering/website | docs/governance-vps-portal-and-soak.md | Current reference / technical contract / dated validation |
| engineering/website | docs/historical-authorisation-prototype.md | Current reference / technical contract / dated validation |
| engineering/website | docs/identity-and-authority-prototype.md | Current reference / technical contract / dated validation |
| engineering/website | docs/kawpow-gpu-deployment-hardening.md | Historical evidence; launch scope clarified |
| engineering/website | docs/kawpow-private-relay-orchestration.md | Historical evidence; launch scope clarified |
| engineering/website | docs/next-development-phases.md | Current reference / technical contract / dated validation |
| engineering/website | docs/organisation-view-and-disclosure-prototype.md | Current reference / technical contract / dated validation |
| engineering/website | docs/organisational-verification-ledger-prototype.md | Current reference / technical contract / dated validation |
| engineering/website | docs/phase-2-evaluation-charter.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-asert-live-validation.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-c1-kawpow-candidate-spec.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-c1-source-audit.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-c2-firopow-candidate-spec.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-c2-firopow-header-mapping-review.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-c4-quai-kawpow-conformance-provenance-assessment.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-c4-quai-kawpow-source-screen.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-consensus-recommendation.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-core-geth-integration-spike.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-difficulty-and-block-timing-proposal.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-difficulty-simulation-results.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-evm-compatibility-gate-review.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-g2-node-gpu-interoperability.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-g3-network-validation.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-gpu-pow-source-screen.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-kawpow-development-work-protocol.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-kawpow-engine-design.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-kawpow-gpu-miner-gate.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-pow-candidate-shortlist.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2a-pow-header-target-mapping-contract.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2b-zk-stack-benchmark-plan.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2c-evm-verifier-evidence.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2c-halo2-feasibility.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2c-native-proof-evidence.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2c-repeated-benchmark-results.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2c-status.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2d-avr-presentation-alpha.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2d-avr-rpc-draft.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2d-durable-avr-indexer.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-2d-scale-and-operations-alpha.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-3-integrated-alpha.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-4-acceptance-and-monitoring-policy.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-4-closed-testnet-foundation.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-4-cross-region-three-miner-rehearsal.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-4-measurement-and-fault-harness.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-4-private-metrics-pipeline.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-4-rehearsal-2026-09-19.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase-4-single-gpu-rehearsal.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase3-signoff-tracker.md | Historical evidence; launch scope clarified |
| engineering/website | docs/phase4-testnet-economics-policy.md | Historical evidence; launch scope clarified |
| engineering/website | docs/platform-current-state.md | Current reference / technical contract / dated validation |
| engineering/website | docs/product-dashboard-architecture.md | Current reference / technical contract / dated validation |
| engineering/website | docs/verification-receipt-developer-guide.md | Current reference / technical contract / dated validation |
| engineering/website | docs/verification-receipt-readiness-review.md | Current reference / technical contract / dated validation |
| engineering/website | docs/vps-base-sepolia-avr-indexer.md | Current reference / technical contract / dated validation |
| engineering/website | docs/vps-base-sepolia-synthetic-ingress.md | Current reference / technical contract / dated validation |
| engineering/website | docs/vps-governance-worker.md | Current reference / technical contract / dated validation |
| engineering/website | docs/zk-001-policy-evaluation-statement.md | Current reference / technical contract / dated validation |
| engineering/website | docs/zk-001-threat-model.md | Current reference / technical contract / dated validation |
| engineering/website | docs/zk-003-proof-batching.md | Current reference / technical contract / dated validation |
| engineering/website | docs/zk-004-verifier-governance.md | Current reference / technical contract / dated validation |
| engineering/website | services/governance/README.md | Current reference / technical contract / dated validation |
| engineering/website | website/docs/brand-platform.md | Current reference / technical contract / dated validation |
| engineering/website | website/docs/commercial-model.md | Current reference / technical contract / dated validation |
| engineering/website | website/docs/homepage-film-storyboard.md | Current reference / technical contract / dated validation |
| planning | planning/business/01-project-strategy.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/02-commercial-model.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/03-founding-partner-programme.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/04-operations-metrics-and-risks.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/05-decision-register.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/06-ai-usage-intelligence-exchange.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/07-ai-safety-monitoring-positioning.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/08-tokenomics-and-mining-security-work-package.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/09-day-one-network-and-contract-plan.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/10-token-demand-and-adaptive-security-budget.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/11-exchange-readiness-strategy.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/12-consensus-and-miner-value-review.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/13-settlement-architecture-decision.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/README.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/business/source-commercial-requirements.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/01-commercialisation-gap-analysis.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/02-roadmap-and-swimlanes.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/03-product-architecture.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/04-mvp-and-api-contract.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/05-repository-structure.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/06-requirements-traceability.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/07-base-compatibility-and-cost.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/README.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/review/file-inventory.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/development/review-scope.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/website/01-website-and-marketing-plan.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/website/02-copy-and-content-backlog.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/website/README.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/strategy/01-brand-and-website-strategy.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/strategy/02-technical-whitepaper-plan.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/strategy/03-investor-pitch-deck-plan.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/strategy/04-development-phases.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/strategy/05-phase2-story-contract.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/strategy/06-phase3-visual-experience.md | Current primary plan or historical proposal with precedence notice |
| planning | planning/strategy/README.md | Current primary plan or historical proposal with precedence notice |

## Validation completed

Website production build passed. All 20 existing website tests passed after updating the homepage metadata expectations to the revised product wording. Browser inspection confirmed the platform page and its navigation to the new status page, including rendered layout. Seven current documentation entrypoints had no missing local link targets. A final website copy scan found no old own-PoW launch, KawPoW launch or retired numeric price claims in active app/docs source. No public deployment, runtime service change or soak interruption was performed during this review.
