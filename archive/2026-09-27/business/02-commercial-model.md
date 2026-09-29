# Commercial model — 27 September 2026

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

Status: hypotheses, not a price list or active offer. [Platform baseline](C:/AIChain/docs/platform-architecture.md).

## Service economics

Revenue is proposed from monthly/annual workspace access with an included accepted-event allowance, transparent overages, integration and support. The company sponsors Base gas from a bounded operating wallet. Customers do not need ETH or a platform token; sponsorship does not imply all API usage is free.

| Concept | Intended use | Still to decide |
|---|---|---|
| Evaluate | Capped synthetic/developer evaluation | Allowance, abuse limits, retention and onboarding |
| Operate | Team governance, metrics and investigations | Subscription, event overage, roles and support |
| Enterprise | Organization-wide integration and requirements | Deployment, identity, residency, retention and contracted service levels |

Retired September price ranges are not active assumptions. Measure accepted structured events, not model runs or chain transactions: one run may produce several events; one anchor covers many receipts. Identical ingestion retries must not create another billable accepted event. Billing reconciliation, plan limits and commercial metering still need implementation.

## Costs and constraints

Measure validation, API/database I/O, structured-record retention, receipt/proof storage, signing, relaying, Base L2 and L1-data fees, indexing, exports, backups, observability and support. Gas is an internal service cost; no customer-wallet interaction is required. The current SQLite byte accounting and sidecar storage are not a production billing ledger. A 2,400-record soak does not justify production unit prices or SLAs.

Source conversations, documents and media are never a custody/revenue line. Structured governance retention needs explicit limits and deletion/backup handling. Priority service tiers may control queue scheduling, but paid status must not weaken validation or isolation. The current pilot has no production priority queue.

## Release gates

Design-partner value, cost measurements, quotas, identity and security review, retention/support terms, encrypted backups and successful restoration, separate environments and a deliberate Base mainnet decision precede paid release. Usage-intelligence marketplaces are separate permission/privacy-gated discovery. No native-token sale, exchange objective or miner economics funds this service plan.
