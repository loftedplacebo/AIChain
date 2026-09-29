# Orvessian documentation

Seven guides are the active starting points. Reviewed 27 September 2026; runtime status requires a fresh operational check.

Production-foundations status was consolidated on 29 September: the roadmap now
has one current requirement/evidence/gate matrix. Intermediate implementation
chronology is archived; exact native, browser and provider checks retain their
scope in linked supporting records. Hosted readiness remains incomplete.

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
- [Competitor research and monitoring](competitor-research.md): dated vendor evidence, trade-offs and complementary positioning.
- [SDK integration plan](sdk-integration-plan.md): prioritised adapters and release criteria; planned compatibility is not shipped support.
- [Historical archive and relocation catalog](archive/README.md).

## Maintenance rule

Update these guides in place. Add a specification, ADR or dated validation artifact when needed, rather than another current-state report. Archive superseded plans with their original evidence intact. Historical reports do not establish current readiness; a synthetic testnet demonstration does not establish production availability.
