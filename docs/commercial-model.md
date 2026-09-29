# Commercial model — 27 September 2026

Status: indicative launch pricing authorised for website publication on 27 September 2026. These are provisional product hypotheses, not validated unit economics or active paid offers. [Platform baseline](platform-architecture.md), [competitor research](competitor-research.md).

## Indicative website prices

All prices are GBP excluding applicable taxes. Owner requested illustrative prices and live publication; this supersedes earlier instructions to omit all numeric pricing. It does not authorise billing or represent production readiness.

| Tier | Indicative price | Proposed allowance and additional usage |
|---|---|---|
| Evaluate | Free | Synthetic demo now; future developer sandbox capped at 5,000 events/month, no paid overages |
| Operate | £99/month or £990 billed annually (saving £198 against 12 monthly payments) | 100,000 events/month; £10 per additional 10,000, prorated at £1 per 1,000 |
| Enterprise | From £999/month equivalent, £11,988/year on an annual agreement | From 1 million events/month; scope and overage rates agreed; implementation services scoped separately |

Allowances reset monthly on both billing periods; no annual pooling or rollover is proposed. No checkout or subscriptions are activated. Prices may change before launch after cost, demand and operational checks. Confirm rounding, budget caps, payment/refund terms, retention and support before issuing a paid offer. These prices are deliberately illustrative, not a finding from competitor research.

## Service economics

Revenue is proposed from monthly/annual workspace access with an included accepted-event allowance, transparent overages, integration and support. The company sponsors Base gas from a bounded operating wallet. Customers do not need ETH or a platform token; sponsorship does not imply all API usage is free.

| Concept | Intended use | Still to decide |
|---|---|---|
| Evaluate | Free public synthetic demo now; proposed capped developer sandbox for validating one workflow | Validate proposed allowance, retention, abuse limits and onboarding; no public managed API entitlement yet |
| Operate | Proposed monthly/annual workspace subscription, included event allowance and reviewer collaboration; metrics, investigations and ordinary evidence exports | Validate indicative price/allowance, reviewer/project limits, retention and support; rules, alerts and incident lifecycle remain planned |
| Enterprise | Proposed annual agreement for wider organisational requirements, contracted usage and tailored onboarding | Identity/provisioning, deployment/residency feasibility, custom retention and support commitments; implementation work scoped separately |

Retired September price ranges are not active assumptions. Measure accepted structured events, not model runs or chain transactions: one run may produce several events; one anchor covers many receipts. Identical ingestion retries must not create another billable accepted event. Billing reconciliation, plan limits and commercial metering still need implementation.

## Lessons from competitors

The [dated research register](competitor-research.md) records official-source pricing and its limits. LangSmith combines seats and consumption; Langfuse uses platform fees and usage with unlimited users on listed paid tiers; Braintrust combines platform access with processing/scoring/retention. These support a workspace-plus-consumption hypothesis, not a market-validated Orvessian price.

The preferred design includes reviewer collaboration rather than a fee for every viewer. Do not promise unlimited users before operational limits are known. Maintain ordinary evidence export within the paid workspace and freely accessible independent verification tooling, subject to a deliberate SDK licensing/publication decision. Commercial value comes from ongoing governance, managed evidence and operational support, not a paywall around checking an exported record.

Baseline security, tenant isolation and correct verification apply to every tier. Enterprise differentiates on scale, organisational configuration, deployment obligations and service commitments. Do not reserve basic data protection for a higher price. Price extended structured-record retention or specialist services only when their costs and customer value are understood; source-content storage remains outside the business.

## Proposed metering contract

- Count each unique durably accepted event once. Rejected events, identical retries, reads, verification and ordinary record exports do not create accepted-event charges. Rate/abuse limits are separate and must be disclosed.
- Include an allowance in Operate; show accepted usage, remaining allowance, estimated overage and budget alerts. Agree spend caps and explicit handling of queued/rejected over-limit events; no silent record loss or unexpected automatic upgrade.
- Use a reconciled, tenant-scoped metering ledger with event IDs and documented period/timezone, correction, credit and dispute rules. Test reconciliation independently of worker batches and chain transactions.
- Receipt generation and sponsored anchoring belong in service unit economics. Customers do not buy gas, credits denominated in crypto, or tokens to use a tier.
- The indicative annual Operate price is £990; monthly allowances still apply. Publish a calculator only once its assumptions match measured billing behaviour.

## Pilot and pricing validation

Start with one partner workflow, a named engineering owner and a reviewer. Before quoting an operational pilot, pass applicable data/security gates and agree scope, duration, allowed data, support and exit/export terms. Where appropriate, scope integration assistance separately from recurring workspace access; do not promise open-ended bespoke development.

Measure time to first accepted event and independently verified export, investigation/report preparation time, evidence completeness within the declared capture boundary, weekly reviewer activity and willingness to renew. Record the customer's existing tool spend and the incremental value of adding Orvessian. Model small, typical and peak workloads using accepted events, bytes, retention, exports, confirmation work and support. Select initial prices only after measuring total cost and partner willingness to pay; competitor starting prices are context, not a price floor or target.

## Website expression

Use the same Evaluate / Operate / Enterprise definitions on both plans routes.
Show audience, intended benefit, proposed charging basis, scope and availability.
Evaluate's current action opens the synthetic demo; Operate links to the platform
preview; Enterprise links to readiness. Show planned rules/integrations/enterprise
controls explicitly. Display the indicative prices and allowances above with GBP,
tax, billing-period and preview disclosures. No fabricated contact route, signup
flow, checkout or SLA. Public managed onboarding is a separate delivery item.

## Costs and constraints

Measure validation, API/database I/O, structured-record retention, receipt/proof storage, signing, relaying, Base L2 and L1-data fees, indexing, exports, backups, observability and support. Gas is an internal service cost; no customer-wallet interaction is required. The current SQLite byte accounting and sidecar storage are not a production billing ledger. A 2,400-record soak does not justify production unit prices or SLAs.

Source conversations, documents and media are never a custody/revenue line. Structured governance retention needs explicit limits and deletion/backup handling. Priority service tiers may control queue scheduling, but paid status must not weaken validation or isolation. The current pilot has no production priority queue.

## Release gates

Design-partner value, cost measurements, quotas, identity and security review, retention/support terms, encrypted backups and successful restoration, separate environments and a deliberate Base mainnet decision precede paid release. Usage-intelligence marketplaces are separate permission/privacy-gated discovery. No native-token sale, exchange objective or miner economics funds this service plan.
