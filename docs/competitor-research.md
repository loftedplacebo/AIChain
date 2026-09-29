# Competitor research and monitoring register

Baseline reviewed: 27 September 2026. Supporting research for the [product strategy](product-strategy.md), [delivery backlog](roadmap-and-decisions.md#competitive-feature-backlog) and [commercial model](commercial-model.md); this is not a separate roadmap.

## Method and confidence

The entries below are summaries of official vendor pages, not hands-on comparative tests. Prices are advertised USD starting prices checked on the review date, not comparable total bills or evidence of revenue/profitability. Vendor claims about assurance, compliance and enforcement require validation. “Not established” means the reviewed sources did not settle the question; it does not mean the vendor lacks the feature. Pros and cons describe fit for our intended buyer, not universal product rankings.

Our comparison baseline is the [implemented synthetic/testnet platform](platform-architecture.md). No production availability or feature parity is implied. Target buyer: an AI/platform owner and operations reviewer responsible for one consequential AI workflow.

## Priority watchlist

| Company / category | Strengths and buying appeal | Trade-offs / questions to test | Monetisation snapshot | Orvessian response and complement hypothesis |
|---|---|---|---|---|
| **LangChain / LangSmith** — agent engineering; high priority | Agent construction and orchestration ecosystem; tracing, evaluations and deployment across frameworks | Seats plus consumption require workload-specific costing. Our narrower review workflow must justify another product | Developer free with limits; Plus $39/seat/month plus usage; custom Enterprise | Integrate LangChain/LangGraph activity and retain LangSmith trace references. Supply structured decision review and portable verification alongside engineering diagnostics. Priorities CF-01, 03, 05, 08. [Pricing](https://www.langchain.com/pricing), [observability](https://docs.langchain.com/langsmith/observability), [orchestration](https://docs.langchain.com/oss/python/langgraph/overview) |
| **Langfuse** — open-source observability/evaluation; high priority | Accessible cloud entry, self-hosting option, collaborative usage model | Free/self-hosted alternatives raise the bar for charging for generic dashboards; self-hosting has customer operating costs | Hobby free; Core $29/month, Pro $199/month, additional usage; Enterprise options | Preserve customer-held traces; ingest selected structured metadata and scores. Differentiate the decision-to-review-to-evidence workflow. CF-01, 03, 05, 09. [Pricing](https://langfuse.com/pricing), [monetisation](https://langfuse.com/handbook/chapters/monetization) |
| **Braintrust** — evaluation and observability; high priority | Tracing, evaluation scores, experiments and collaborative review | Multiple usage dimensions and retention affect the bill. Importing a score must preserve evaluator/version context | Starter free with allowances; Pro $249/month plus usage; custom Enterprise | Import adjudicated/evaluated outcomes with provenance; link them to governed decisions and independently checkable exports. Avoid building a complete experiment suite initially. CF-03, 05, 08. [Pricing and features](https://www.braintrust.dev/pricing) |
| **Arize AX / Phoenix** — observability and evaluation; high priority | Phoenix offers an open-source entry; AX combines production investigation and evaluation with unlimited users on listed plans | Open-source availability makes basic telemetry weak differentiation; compare managed AX and self-managed Phoenix separately | AX Free; Pro $50/month with allowances; custom Enterprise. Phoenix has an open-source option | Prioritise OpenTelemetry/OpenInference mapping and retain investigation references. Add business review and receipt verification to selected observations. CF-01, 03, 05. [Pricing](https://arize.com/pricing/), [Phoenix](https://arize.com/docs/phoenix) |
| **Fiddler** — enterprise monitoring, enforcement and governance; high priority | Vendor positions continuous evaluation, monitoring, inline policy enforcement and auditable governance together | Broad enterprise scope; deployment effort, exact coverage and commercial terms require a scoped evaluation. Do not repeat vendor exclusivity/performance claims as facts | Enterprise demo/contact route; numeric pricing not established in reviewed source | Accept structured control decisions from customer enforcement tools and preserve their provenance. Our reporting must not claim runtime blocking. CF-04, 06, 08. [Product](https://www.fiddler.ai/) |
| **Credo AI** — organisational AI governance; high priority | Vendor describes AI/agent registry, discovery, risk classification and dependency mapping | Breadth of organisational governance may overlap our intended buyer budget. Operational depth and evidence portability need direct testing | Demo/contact-led; numeric pricing not established in reviewed source | Connect operational decisions to system IDs, owners and policy versions; export evidence into the customer's broader governance programme. CF-02, 06, 08. [Product](https://www.credo.ai/) |
| **Holistic AI** — inventory, risk and policy governance; high priority | Vendor describes discovery across cloud/code/SaaS, ownership, testing and continuous monitoring | Broad discovery and policy claims require coverage checks in the customer's actual estate. We must not confuse reporting coverage with discovered inventory | Demo/contact-led; numeric pricing not established in reviewed source | Feed structured operational evidence into assessments; retain external system/control references. CF-02, 03, 06, 08. [Product](https://www.holisticai.com/) |

## Differentiators to demonstrate, not assume

| Proposed distinction | Evidence / current boundary | How to validate with a partner |
|---|---|---|
| Portable, independently checkable record evidence | Synthetic/testnet path has record commitments, recorder signatures, private membership proofs and Base anchors. This proves recorded-byte integrity/inclusion, not source truth or AI correctness | Reviewer verifies an export without relying on our dashboard; compare steps and information available from the customer's existing tool |
| Source content stays customer-held | Bounded structured records only; no hosted prompts, conversations, documents or sensor streams. Structured metadata can still be sensitive; competitors can also offer privacy controls | Inspect every outbound adapter field and demonstrate that source content is excluded before transmission |
| Operational governance across tools | Shared decision/outcome investigation exists in pilot scope; ownership, rules and incident lifecycle need development | Resolve an exception spanning model/provider changes and export a coherent review history |
| Fits beside existing engineering and governance tools | Complement hypothesis; named integrations are not shipped | Integrate one partner workflow without replacing tracing, inference or enforcement systems; measure effort and repeat use |

Do not claim unique cryptographic assurance until equivalent competitor export/signature/anchor capabilities have been explicitly checked. Maintain evidence portability even when a customer leaves. Our present disadvantages are limited integrations, unfinished governance automation, no validated production onboarding, and unproven customer demand; anchoring does not remove these gaps.

## Monitoring and decision process

- **Weekly, Monday 09:00 Europe/London:** this task's competitor-review automation checks official pricing, product/docs and linked release notes. First scheduled review: 28 September 2026. Notify only on meaningful changes or required action.
- **Monthly:** product owner reviews the feature backlog and proposed SDK order; record keep/build/integrate/defer decisions with customer evidence. Owner role is assigned; no individual appointment is implied.
- **Quarterly or before a purchasing comparison:** run a representative hands-on workflow, with accounts/permissions arranged separately. Recalculate total cost for the same users, event/trace volumes, storage, retention and support needs. A trace/span/vendor unit is not an Orvessian accepted event.
- Track feature availability (GA/beta/preview), capture controls, deployment/residency, independent exports, pricing units/allowances, SDK compatibility, evaluations, incident workflow and organisational governance.
- Every material finding records observed date, direct URL, old/new claim, confidence, customer impact, affected CF-/SDK- ID and recommended action. An inaccessible source becomes unknown/stale, not a negative feature finding.
- Reprioritise when a gap blocks a partner workflow, reduces integration friction or delivers measurable reviewer value. Seek broad coverage through common interfaces; do not turn every competitor checkbox into an immediate build commitment.

## Change log

| Date | Finding / decision | Impact |
|---|---|---|
| 2026-09-27 | Established seven-company official-source baseline; expanded the earlier website positioning notes | Added CF-01–CF-10 and SDK-00–SDK-12 planning references; clarified workspace-plus-usage commercial direction |

The scheduled review may maintain this register and recommend changes. Public claims, prices, launch commitments and deployment remain deliberate product decisions.

## Review — 28 September 2026

Reviewed official product/pricing pages for all seven vendors, LangSmith's cloud
changelog, Langfuse's v4 announcement and changelog, Braintrust's news index,
Arize's AX/Phoenix guide, Fiddler's product/blog index, Credo's self-hosted release
notes and Holistic AI's news index. No material overnight change was verified
against the 27 September baseline. The findings below are newly recorded research,
not claims of releases since yesterday. Vendor documentation is verified as a
published claim; integration behaviour has not been independently tested.

### Material additions to the baseline

| Observed / source date | Verified vendor statement | Implication and recommendation |
|---|---|---|
| 28 Sep / announcement 17 Aug 2026 | Langfuse Cloud becomes v4-only on **16 November 2026**, retiring legacy APIs/features/ingestion. New projects use v4; existing projects should follow their migration checks. The announcement points to selected-field Observations API v2 and Metrics API v2. [Official v4 announcement](https://langfuse.com/changelog/2026-08-17-langfuse-v4) | **High integration priority, SDK-01/05, CF-01/03/05:** target the supported v4 data model and verify specific endpoint/SDK compatibility before building an importer. Avoid introducing a new legacy-read dependency. Keep customer-side field allowlisting and trace references. API version numbers are distinct from the product's v4 label. Review this dependency before 16 November; no existing Orvessian Langfuse connector needs migration today. |
| 28 Sep / week 14–21 Sep 2026 | LangSmith's changelog documents automated scores preserved alongside human annotations in exports, root-timestamp-aware trajectory metadata, thread webhook payloads, and report scan retries with smaller pages. [Official cloud changelog](https://docs.langchain.com/langsmith/changelog) | **CF-03/04/05/06, SDK-05/09:** retain distinct human/evaluator provenance, incomplete-capture indicators and bounded/resumable reads in acceptance criteria. Webhooks could supply selected governance observations, but payloads must be filtered customer-side rather than importing raw conversations. These are documented opportunities, not tested Orvessian compatibility. |
| 28 Sep / release date not established | Credo AI installer v19 notes document an optional ServiceNow integration with extra services and a dedicated externally reachable hostname. [Official release notes](https://docs.selfhost.credo.ai/docs/self-hosted/release-notes/v19/) | **SDK-10/12, CF-06/07:** ticketing/GRC interoperability is a concrete competitive expectation. Keep ServiceNow partner-led; assess deployment/security and operating cost before promising it. This does not prove that a general evidence-import API is available to us. |

### Pricing and coverage checks

Advertised starting prices remain consistent with the baseline: [LangSmith](https://www.langchain.com/pricing)
Plus $39/seat/month plus usage; [Langfuse](https://langfuse.com/pricing) Core $29/month
and Pro $199/month plus usage; [Braintrust](https://www.braintrust.dev/pricing) Pro
$249/month plus usage; [Arize AX](https://arize.com/pricing/) Pro $50/month with
allowances. Fiddler, Credo AI and Holistic AI product pages still do not establish
numeric prices for this comparison. No pricing change recommendation follows from
this review. Orvessian's GBP indicative prices remain unchanged; do not compare
vendor traces/spans/units directly to accepted events or ignore currency, retention,
evaluation and support differences.

Additional reviewed sources: [Fiddler product](https://www.fiddler.ai/),
[product announcements](https://www.fiddler.ai/category/product),
[Credo AI product](https://www.credo.ai/),
[Holistic AI product](https://www.holisticai.com/),
[news](https://www.holisticai.com/press-release),
[Braintrust news](https://www.braintrust.dev/blog),
[Arize AX/Phoenix guide](https://arize.com/resources/arize-ax-or-phoenix/).
No independently verified new cryptographic export/anchoring equivalent was
established in this pass; that is an unknown, not a competitor deficiency.

### Comparison with our current work

The latest architecture/SDK/roadmap notes now record local Python ingestion,
registry/heartbeats, a narrow LangChain/LangGraph path, one live OpenAI smoke test,
a reviewer workflow and SQL reporting improvements. These supersede older
planned-only paragraphs for that local scope; they do not establish deployed or
published SDK availability. Broad OTel mapping, vendor evaluation import, rule/
alert delivery and production gates remain unfinished.

Recommended order: (1) retain reliability and production gates; (2) complete the
common metadata/OTel contract with a v4-compatible Langfuse evaluation/observation
mapping as the next SDK-05 design candidate; (3) preserve provenance and build
versioned rules, delivery status and incident follow-up around the existing local
review workflow. Prefer complementary tracing/evaluation imports to rebuilding
those products. Priorities are recommendations for product review, not automatic
roadmap changes or new implementation commitments. No website, price, release
commitment or deployment was changed by this review.
