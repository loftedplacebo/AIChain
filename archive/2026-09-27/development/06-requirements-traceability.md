# Source requirements coverage

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

14 September 2026 · Maps every numbered section of the [original brief](../business/source-commercial-requirements.md) to the proposal; coverage does not mean implementation is complete

| Brief section | Requirement | Primary treatment |
|---|---|---|
| 1 | Expand from chain to commercial infrastructure | [Strategy](../business/01-project-strategy.md), [gap analysis](01-commercialisation-gap-analysis.md) |
| 2 | Off-chain AI, independently checkable record | [Architecture](03-product-architecture.md) |
| 3 | Explain why a blockchain is used | [Strategy](../business/01-project-strategy.md), including costs and alternatives |
| 4 | Separate open protocol and commercial product | [Architecture](03-product-architecture.md), [commercial model](../business/02-commercial-model.md) |
| 5 | Official SDK | [MVP contract](04-mvp-and-api-contract.md), DEV-04 |
| 6 | Framework integration and OpenAI candidate | [MVP contract](04-mvp-and-api-contract.md), DEV-12/13 |
| 7 | Different kinds of verification | [Architecture assurance matrix](03-product-architecture.md) |
| 8 | Private off-chain evidence | [Architecture custody model](03-product-architecture.md), DEV-06 |
| 9 | Public explorer vs private context | [Gap analysis](01-commercialisation-gap-analysis.md), P3, website `/network` |
| 10 | Commercial verification API | [MVP contract](04-mvp-and-api-contract.md), DEV-05–10 |
| 11 | Recurring service revenue | [Commercial model](../business/02-commercial-model.md) |
| 12 | Company/network economics separated | [Commercial model](../business/02-commercial-model.md) |
| 13 | GPU mining remains important | Lane A and retained Phase 4 gates in [roadmap](02-roadmap-and-swimlanes.md) |
| 14 | Token utility not company funding thesis | [Commercial model](../business/02-commercial-model.md) |
| 15 | No premature token allocation | D-08, [commercial model](../business/02-commercial-model.md); no protocol edits |
| 16 | Institutional funding and traction | P5 and [funding readiness](../business/02-commercial-model.md) |
| 17 | Founding AI Partner Programme | [Partner programme](../business/03-founding-partner-programme.md) |
| 18 | Developer ecosystem and ten-minute onboarding | P1–P3, [MVP](04-mvp-and-api-contract.md), [website plan](../website/01-website-and-marketing-plan.md) |
| 19 | Grants and hackathons | [Partner programme](../business/03-founding-partner-programme.md), [marketing](../website/01-website-and-marketing-plan.md) |
| 20 | Outcome-led positioning | [Strategy](../business/01-project-strategy.md), [draft copy](../website/02-copy-and-content-backlog.md) |
| 21 | Enterprise audit/governance expansion | P4, staged [commercial offers](../business/02-commercial-model.md) |
| 22 | Five technical workstreams | A–D plus C/G commercial platform, within eight [swim lanes](02-roadmap-and-swimlanes.md) |
| 23 | Minimal end-to-end product | [MVP journey and acceptance matrix](04-mvp-and-api-contract.md) |
| 24 | Preserve existing phases and analyse gaps | [Phase-by-phase gap analysis](01-commercialisation-gap-analysis.md) |
| 25 | Dogfood same SDK/API | P1/P2, DEV-12/13 and WEB-05 |
| 26 | Product, network, commercial metrics | [Metric dictionary](../business/04-operations-metrics-and-risks.md) |
| 27 | 10–15 teams and 50,000 actions/week | P5; explicit target and counting definitions |
| 28 | Foundation/company distinction | [Commercial model](../business/02-commercial-model.md), adviser work package |
| 29 | Optimise for adoption and business usefulness | [Strategy](../business/01-project-strategy.md), stop/change criteria |
| 30 | Fifteen-part commercialisation review before core refactor | [Gap analysis](01-commercialisation-gap-analysis.md), [review scope](review-scope.md) |
| 31 | Revised phases with deliverables/dependencies/tests/security/exits/parallelism | P0–P5 in [roadmap](02-roadmap-and-swimlanes.md) |
| 32 | Integrated long-term vision | [Architecture flow](03-product-architecture.md), staged enterprise roadmap |
| User request | Separate development, website and business areas | Created folders; [safe code migration plan](05-repository-structure.md) |
| User request | Consider website changes thoroughly | Page audit, audience journeys, content/copy, funnel and release criteria |

## Required review questions from section 30

Items 1–7 (architecture, Phase 4 state, verification/receipt/proof/API/SDK/explorer) are in sections 1–4 of the gap analysis. Items 8–11 (missing components and change classification) are in its capability and change tables. Items 12–13 (security and dependencies) are in sections 6–7 and the architecture. Items 14–15 (revised phases and immediate parallel work) are in the roadmap.

## Historical strategy conflicts resolved in this proposal

| Existing artifact | Conflict or ambiguity | Disposition |
|---|---|---|
| `product-layer.md` | Passports, mandates, payment/reputation as primary product | Keep historical vision; current proposal starts with selected-event verification |
| `build_tokenomics_report.py` / old tokenomics report | Work-released currency, illustrative 5/55/25/15 allocation and two payment rails | Historical research, not accepted issuance or current funding policy; do not regenerate as the new plan |
| `scaling.md` | Rollups/aggregated proofs foregrounded | Future option; existing batch anchors precede recursive aggregation |
| `strategy/01-brand-and-website-strategy.md` | “Human certainty” primary headline and Review product emphasis | Proposed developer-first repositioning; retain artwork and accountability story |
| `strategy/02-technical-whitepaper-plan.md` | Technical publication next | Still useful; update abstract/product architecture, pin claims and retain non-claims |
| `strategy/03-investor-pitch-deck-plan.md` | Deck outline without real buyer/team/budget evidence | Retain outline; fill only from measured traction and founder facts |
| `docs/next-development-phases.md` | Older Phase 3 active text despite later sign-off | Latest dated sign-off governs observed status; reconcile headers in next roadmap update |
| `docs/phase-4-closed-testnet-foundation.md` | Some entry checklist items lag completed Phase 3 evidence | Link actual sign-off; do not auto-check remaining network requirements |

This document supersedes none of the original technical formats or accepted ADRs. It identifies proposed changes in emphasis and work order for review.

## Subsequent strategy addition — 19 September 2026

The proposed [AI Usage Intelligence Exchange](../business/06-ai-usage-intelligence-exchange.md) is an optional future commercial layer. It maintains the brief's privacy requirement by excluding raw evidence from resale and using consented, privacy-protected aggregates. It uses the network and potential ZK proofs for commitment, eligibility and aggregate-computation provenance, without claiming that they anonymise source data or validate its truth. It is discovery-only until after the core testnet/developer product path.

## Subsequent strategy addition — 19 September 2026

The [AI safety, monitoring and verification positioning](../business/07-ai-safety-monitoring-positioning.md) adds a core use case without expanding consensus scope: selected permissions, monitor alerts and interventions can use existing receipt/profile/link concepts. Real-time prevention and containment stay in customer-controlled runtime/security systems. The research explicitly rejects claims that the chain prevents sandbox escape or resolves general AI alignment.
