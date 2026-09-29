# Decision register

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

**Accepted on 20 September 2026:** D-21 is adopted with **Base** as the launch destination and larger/hierarchical batching evaluated before further consensus work. See [ADR-0009](C:/AIChain/docs/decisions/0009-base-launch-settlement.md) and [the current roadmap](C:/AIChain/docs/archive/2026-09-27/superseded-plans/base-transition-audit-and-roadmap.md). This replaces D-16's own-PoW launch and D-20's parallel mining priority. D-17–D-19 remain conditional future work. Wallet creation, actual cloud-resource shutdown and production launch are not completed by this acceptance.

14 September 2026 · Proposed decisions awaiting roadmap review

**20 September review:** D-21 below is the latest architectural recommendation. If adopted, it replaces the own-PoW launch assumption in D-16 and the parallel mining priority in D-20; D-17–D-19 become conditional research. D-06 still governs any own-network release, but is not a prerequisite for an external-network verification beta. D-18's non-miner percentages remain scenarios, not approved allocations.

| ID | Proposed decision | Owner role | Needed by | Consequence / revisit trigger |
|---|---|---|---|---|
| D-01 | Adopt independent AI evidence as initial commercial focus | Founder/product | P0 exit | Defer payments/passports/robotics product scope; revisit on qualified demand |
| D-02 | Preserve alpha formats; define per-check typed assurance results | Verification lead | P1 design | No global “verified” claim; revisit at schema freeze |
| D-03 | Customer-signed receipts, company-submitted batches for managed MVP | Platform + verification | P1 implementation | Validate live relay/issuer separation; no silent individual relay |
| D-04 | Customer-held private evidence/openings by default | Product + security | Pilot charter | Managed custody becomes an explicit opt-in work package |
| D-05 | Generic Python first, OpenAI Agents first named adapter candidate | Product + DevRel | P1 | Change if first partner needs a different framework |
| D-06 | Existing engineering Phase 4 gates retained; status reconciled | Protocol lead | Next release update | No public-testnet claim without acceptance evidence |
| D-07 | Separate source homes now; migrate code only through isolated path changes | Engineering + website | Before any move | Avoid accidental stale checkout or deployment break |
| D-08 | Service revenue model; no mass retail token presale in this plan | Founder/finance | Commercial materials | Token allocations and legal model remain unapproved |
| D-09 | Position site around developer workflow and open/managed split | Founder + marketing | WEB-01 | Existing brand/artwork retained; no fictional availability |
| D-10 | Define qualifying actions and test/production/subsidy breakdowns | Product + finance | Metering implementation | No counting replays/retries as organic adoption |
| D-11 | Price pilot from measured unit costs and buyer interviews | Founder/finance | Paid offer | Example prices in plan are not published commitments |
| D-12 | Publish supported SDK/receipt components with explicit licenses | Founder + engineering + adviser | External package release | Component/IP/license review required; no new license assigned here |
| D-13 | Explore an opt-in aggregate AI Usage Intelligence Exchange after the core developer/testnet path | Founder/product + privacy/security | I0 discovery | No raw evidence sale; specialist privacy/legal review before collection or buyer access |
| D-14 | Make monitoring/intervention evidence a core use case, with strict non-claims | Founder/product + verification/security | P0/P1 refinement | Additive safety profile and gateway example; do not reframe the chain as containment |
| D-15 | Use “independently verifiable, tamper-evident record” for the network’s resilience value | Founder/product + protocol/security | Website/technical publication | Do not use “AI-resistant”, “immutable”, “AI-proof” or claims that collapse runtime safety into ledger integrity |
| D-16 | Launch a lean PoW verification network; defer financial primitives beyond minimal anchoring/registry/governance contracts | Protocol + founder/finance + security | Public-testnet candidate | Final issuance, allocations, vesting, treasury controls and contract set require the published security-budget model and independent review |
| D-17 | Use fee-driven token utility and a capped adaptive security-budget model; do not tie emissions to raw AI/API activity | Protocol + founder/finance + security | Tokenomics model review | Fee burn, adaptive subsidy and any bonded operator role require simulation, adversarial analysis, public-testnet evidence and legal review |
| D-18 | Model a 60% mining/security reserve with 15% foundation treasury, 10% ecosystem, 10% team/contributors and 5% strategic reserve | Founder/finance + protocol + security | Tokenomics model review | All non-mining allocations are transparent and locked; revise only against security-budget, vesting and legal review evidence |
| D-19 | Treat eventual exchange readiness as a secondary evidence track, not a launch or price objective | Founder/finance + protocol/security + legal/compliance | Mainnet readiness | No venue outreach without technical custody package, transparent supply/vesting, market-conduct controls and jurisdictional review |
| D-20 | Keep GPU PoW as a conditional testnet/community track; select mainnet consensus only against product and security evidence | Founder/product + protocol + security + finance | Before public-testnet/mainnet decision | Compare established-network anchoring, PoW and other alternatives using an approved scorecard; no PoW mainnet by momentum alone |
| D-21 | Launch the verification product on one established public EVM network with no planned own-L1 migration; remove new miner features from the proposed launch critical path | Founder/product + engineering + security | Before public SDK/receipt freeze | [Decision analysis](13-settlement-architecture-decision.md): Base/Arbitrum One selection gates, versioned receipt binding, external finality, public anchor hardening and durable export; recommendation awaiting recorded adoption |

## Inputs still to obtain

Named team/role capacity; cash/runway and spend limits; existing customer conversations; real intake/contact channel; desired corporate jurisdictions; adviser and IP/licensing position; actual independent operator inventory; preferred permanent repository ownership and website deployment root. The plan uses role placeholders and bounded assumptions so these gaps do not prevent technical and commercial review.

## Review outcome template

Record date, reviewer, accepted/modified/deferred decision IDs, final MVP scope, responsible people, next evidence artifact and budget. Keep proposed decisions distinct from accepted ADRs. Do not interpret the presence of this register as approval of a network launch, public site, token allocation or commercial commitment.
