# Operating model, metrics and risks

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

14 September 2026 · Proposed controls · No staffing, customer or uptime claims implied

## Ownership and cadence

Founder/product owns customer priorities and acceptance of scope. Protocol lead owns consensus and network release evidence. Verification lead owns receipt semantics and assurance claims. Platform lead owns API/custody/usage correctness. Security/SRE owns incident preparedness and independent review coordination. Marketing owns the claims ledger and developer funnel. Finance owns service economics and the funding data room.

Assign people before execution; one person can hold several roles but cannot treat an unstaffed lane as delivered. Reserve independent review for security-critical releases and preserve existing multi-approval network release requirements.

Weekly review: active work, partner funnel, incidents, failed/late receipts, queue/backlog, retention, unit cost and upcoming gate evidence. Fortnightly: architecture/dependency decisions. Monthly: cash/runway, price feedback, network concentration, access review and product scope. Record decisions with rationale and revisit date.

## Metric dictionary

The brief's “Verified AI Actions” needs a precise qualification rule. Report **qualifying anchored AI actions** as the base adoption metric and break out the extra checks. Never imply that every action has a ZK proof or has been semantically verified.

| Metric | Definition / exclusions | Source / cadence |
|---|---|---|
| Weekly qualifying actions | Unique tenant + application event identity/revision, valid supported receipt/signature, canonical anchor at chosen depth at reporting cut-off | SDK/API event ledger reconciled with indexer, weekly |
| Evidence-checked actions | Subset whose required openings were actually rechecked; exclude unchecked customer-held bytes | Verifier result records |
| Policy-proved actions | Subset with supported bound policy proof; separate fresh proofs from replays | Proof records and statement/version mapping |
| Active organisations | Independent external organisations with qualifying use during week | Private partner registry and event ledger |
| Repeat integration rate | Activated organisations active in four consecutive weeks / eligible activated cohort | Cohort reports, weekly |
| Production usage | Qualifying actions from real production workflows on a production-approved network | Explicit environment labels; not inferred from volume |
| Trial/test usage | Separate private/public testnet, synthetic, internal and replay categories | Environment and workload classification |
| Onboarding time | Start of documented setup to independently checked event; report account/network delays separately | Consented external trial, median and p90 with sample size |
| Confirmation latency | Durable acceptance to chosen canonical depth; p50/p95/p99; stalled jobs included | Service and chain clocks with uncertainty |
| Evidence availability | Successful authorised opening retrieval / valid retrieval attempts | Custody/export service; distinguish customer-held unobserved |
| Developer adoption | Active integrations and SDK versions; downloads secondary | API/library version telemetry with minimisation |
| Miner/node independence | Distinct controlling operators, regions and hardware; self-report plus observed evidence | Release/operator register; no public personal data |
| Paid service metrics | Recurring revenue, paying accounts, gross margin, retention; services/credits separate | Contracts/invoices and cost ledger, monthly |

Deduplicate across API retries and batch resubmissions. Link correction versions and network resets rather than inventing fresh “activity”. Re-evaluate canonical status before closing a reporting period; record subsequent reorg corrections. An anchored leaf does not establish genuine external use without customer/workflow provenance. Review a consented sample rather than centrally collecting every customer's raw evidence.

Traction target: 10–15 active independent organisations and approximately 50,000 qualifying actions/week, sustained for four weeks. Publish production/testnet, subsidy and assurance breakdowns. Report largest-customer concentration; a suggested watch threshold is more than 40% of volume from one customer, not an automatic disqualification.

## Risk register

| Risk | Severity / owner | Leading signal | Mitigation and release consequence |
|---|---|---|---|
| Fabricated or omitted source events | High / verification | Reviewers mistake capture for truth | Explicit provenance/check scope; authenticated capture when demanded; no universal verified badge |
| Compromised signing key | High / security | Unusual issuer activity or revocation | Customer-controlled adapters, rotation, historical policy; pause affected submissions |
| Evidence/salt loss | High / platform | Restore/retrieval failures | Persist before acceptance, encrypted backup, tested restore/export; block custody promise |
| Private metadata leakage | High / security | Sensitive profile labels, logs or public manifest fields | Public allow-list, tenant-separated batches initially, secret scans and disclosure review |
| Reorg or small-network attack | High / protocol | Divergent heads, concentration, deep reorg | Independent validation, depth policy, status downgrade, network gate enforcement |
| Relayer/issuer confusion | High / verification | Signature passes but individual event issuer differs | Existing batch route; explicit identities; block misleading attribution |
| Tenant isolation/API abuse | High / platform | Cross-tenant query success, resource exhaustion | Scopes, quotas, auth tests, bounded parsing and external review before public exposure |
| Proof cost or prover failure | Medium-high / platform | Tail queue time and cost spike | Opt-in isolated queue, verifier/version caps, separate pricing |
| Undifferentiated product | High / founder | Buyers prefer existing exports; no willing reviewer | Discovery stop criteria, narrow use case, measurable benefit before expansion |
| Free/incentivised activity mistaken for demand | High / founder-finance | Usage falls when credits end | Separate subsidy cohorts and paid conversion evidence |
| Token/fee and security-budget mismatch | High / protocol-finance | Miner participation/cash cost volatility | Separate economics model, bounded fee inventory, no appreciation assumption |
| Overstated website/funding claim | High / marketing-founder | Missing evidence/version for claim | Dated claims ledger, factual approval before publication |
| Conflicting repository/roadmap sources | Medium / programme | Agents work in old checkout or stale status | Project hub, active-code handoff, canonical decision/status rules |
| Unsupported commercial/legal commitment | High / founder | Customer requests certification, custody or immutable guarantee | Scoped adviser review and contract boundaries before commitment |
| AI usage intelligence re-identification or misuse | High / privacy/product | Small cohorts, rare categories, overlapping buyer queries or requested raw data | Fixed query catalogue, secure aggregation, differential privacy, cohort thresholds and independent review; do not launch exchange |
| Biased or fabricated marketplace signal | High / product | One contributor dominates, incentive-driven volume or poor coverage | Contribution caps, provenance labels, diversity measures, transparent methodology and no row-count rewards |
| Safety marketing overclaim | High / founder-marketing | “Safe”, “prevents escape” or “compliant” appears without support | Claims ledger, explicit control-plane boundary and technical review before publication |
| Safety event capture unavailable during intervention | High / platform | Outbox/monitor failure or unanchored critical event | Fail-safe local policy; durable local capture; alert/disclose missing evidence; never wait for chain confirmation to contain an agent |

## Incident and recovery requirements

For a chain incident: pause risky ingress or mark pending, retain accepted evidence, preserve canonical observations and notify affected customers under the agreed incident policy. Do not silently reset a network to clear a backlog. For evidence access failure: separate “anchor exists” from “evidence unavailable”, restore custody or support customer retrieval and document the gap.

For an API/key incident: revoke compromised credentials, preserve safe audit records, reconcile submitted transactions, and review tenant impact. Do not rotate historical signatures or rewrite old receipts. For a proof-verifier incident: follow existing pause/retire/version governance and retain historical evaluation context.

Every drill records exact failure injected, duration, evidence lost or preserved, recovery steps and unmet objective. RPO/RTO targets in the MVP are proposed service targets; backups alone do not prove recovery capability.

## Adviser work package

Obtain advice on company/foundation structure, IP/licensing, token/fee operations, treasury/accounting, privacy roles, retention/deletion, data processing terms, marketing claims, pilot liability and enterprise SLAs. This plan assigns questions; it does not decide jurisdiction, token classification, required authorisations, tax treatment or legal compliance. Actual corporate documents and advice stay outside public source control.
