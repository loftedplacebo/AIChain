# Orvessian documentation

Seven guides are the active starting points. Reviewed 7 October 2026; live
runtime status still requires a fresh operational check.

The [roadmap's Stage C checkpoint](roadmap-and-decisions.md#stage-c-development-update--6-october-2026)
records the current technical pilot state. The public Site and hosted synthetic
portal/API are live. Two isolated projects have active evidence workers and
independently verified Base Sepolia receipts. A populated two-journal encrypted
B2 backup passed a closed same-cluster restore, and the injected chat alert
drill delivered. The supervised pilot capacity was approved; current runtime
health monitoring is daily while the pilot is idle and must return to a
30-minute cadence during an active partner submission window. Partner
credentials remain gated on the
[pilot owner queue](pilot-owner-actions.md#readiness-checkpoint--5-october-2026).
The 29–30 September roadmap matrix and implementation chronology are historical
snapshots; linked checks retain their original scope.

| Guide | Purpose |
|---|---|
| [Product strategy](product-strategy.md) | Customer value, scope and long-term direction |
| [Platform architecture](platform-architecture.md) | Implemented capabilities, evidence flow and limits |
| [Roadmap and decisions](roadmap-and-decisions.md) | Delivery order, release gates and accepted choices |
| [Developer guide](developer-guide.md) | Integration entry point and exact technical references |
| [Operations runbook](operations-runbook.md) | Deployment, recovery, monitoring and production gates |
| [Commercial model](commercial-model.md) | Indicative website pricing and consumption hypotheses; no active checkout |
| [Website messaging](website-messaging.md) | Route responsibilities, claims and publication policy |

## Supporting references

Exact protocol/API specifications, implementation notes and operator procedures support these guides; they are not competing roadmaps. Follow the developer and operations guides to the relevant detail. Existing detailed Markdown references retain their paths to avoid breaking code and tooling references.

- [API](../services/governance/README.md), [schemas](../spec/), [receipt SDK](verification-receipt-developer-guide.md).
- [Architecture decisions](decisions/), [validation snapshots](validation/), [deployments](deployments/), [examples](examples/).
- [Website repository](../website/README.md).
- [Pilot owner actions](pilot-owner-actions.md): current partner start gate and owner decisions.
- [Design-partner to production roadmap](design-partner-to-production-roadmap.md): staged partner experience, engineering work and later production gates.
- [Multi-project pilot workers](pilot-multi-project-workers.md): repeatable worker provisioning, journal recovery and project-wide monitoring development.
- [VPS disk inventory](vps-disk-inventory-2026-10-05.md): read-only space, active dependencies and reviewed cleanup candidates as of 5 October 2026.
- [Pilot support and incident runbook](pilot-support-and-incident-runbook.md): named owner, alerts, health checks and emergency pause.
- [First design-partner proposal](examples/first-design-partner-synthetic-pilot-proposal.md): internal synthetic workflow, fields and proposed measures awaiting partner agreement.
- [Production release checklist](production-release-checklist.md): business, legal, security, recovery and commercial gates for a future paid service.
- [Hosted pilot integration](hosted-pilot-application-integration.md): live portal/API, waitlist approval procedure, backup checks and remaining hosted gates.
- [Competitor research and monitoring](competitor-research.md): dated vendor evidence, trade-offs and complementary positioning.
- [SDK integration plan](sdk-integration-plan.md): prioritised adapters and release criteria; planned compatibility is not shipped support.
- [Historical archive and relocation catalog](archive/README.md).

## Maintenance rule

Update these guides in place. Add a specification, ADR or dated validation artifact when needed, rather than another current-state report. Archive superseded plans with their original evidence intact. Historical reports do not establish current readiness; a synthetic testnet demonstration does not establish production availability.
