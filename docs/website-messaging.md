# Website and marketing plan — 27 September 2026

The website should introduce the governance platform through customer questions: which agents reported, what decisions and outcomes were recorded, how model cohorts compare and what evidence supports an investigation. The trust layer supports that workflow. Preserve the current visual language and narrative interactions.

## Route responsibilities

| Route | Role | Required boundary |
|---|---|---|
| / | Introduce governance value and link the interactive demo | Synthetic testnet validation, no production availability |
| /product | Explain platform workflow and record detail | Planned rules/alerts separate from submitted incidents |
| /products and /products/governance-preview | Indicative launch pricing and plan comparison | Label provisional GBP prices and allowances; no checkout or production SLA |
| /portal | Public synthetic demonstration | Never imply private customer data or a live model benchmark |
| /workspace | Provisioned authenticated pilot | Private VPS API; local website requires SSH tunnel |
| /explorer | Public anchor checks | No private event reconstruction without authorized records |
| /technology and /technical | Base application architecture and assurance | No own L1/L2 launch, universal correctness or Ethereum-finality claim |
| /developers | Runnable local receipt example plus pilot context | Public managed API onboarding still gated |
| /status | Dated implemented/planned/deferred summary | Not a live operational monitor |
| /whitepaper | Working technical narrative | Historical proof scope distinct from current receipt pipeline |
| /safety, /in-action, /vision | Boundaries and illustrative/future scenarios | No autonomous containment or deployed vertical claims |

## Conversion and publication

Plans refresh, 27 September 2026: both plans routes share Evaluate, Operate and
Enterprise cards and a feature/status comparison. Evaluate offers a free synthetic
demo now and describes a capped developer sandbox as planned. Operate proposes
workspace subscription plus included events and transparent overages; reviewer
collaboration and ordinary evidence exports are part of the direction. Enterprise
describes a scoped annual agreement, organisational controls and separately scoped
implementation work. Owner subsequently authorised indicative website prices:
Free; Operate £99/month or £990/year with 100,000 events/month and £10 per extra
10,000; Enterprise from £999/month (£11,988/year), from 1 million events/month.
Future free sandbox: 5,000 events/month. Prices exclude applicable taxes and may
change before launch. Service commitments remain unset. [Commercial details](commercial-model.md).
Use actual demo, platform and status destinations; planned API access, alerts,
integrations and enterprise controls must not appear as currently included services.

The [competitor register](competitor-research.md) now owns the dated watchlist,
pros/cons, sources and complement hypotheses. The [SDK plan](sdk-integration-plan.md)
owns proposed integration coverage; do not show partner badges or “supported”
claims until each adapter's acceptance and publication criteria pass.

Use demo → product explanation → current status → developer tooling. Do not invent partner intake, checkout or install commands for unpublished packages. When public access exists, add a reviewed onboarding route with actual terms and support.

Before publication: build and route tests, visual check, confirm which environment serves /workspace, ensure secrets are server-side and review all availability claims. Never publish localhost/private transport assumptions as public availability. Keep the public snapshot dated and update it after final soak reconciliation.

Publication on 27 September 2026: indicative pricing and the shared tier comparison
were deployed as Sites version 22 from website commit
`89666af36054ed89e9ae1b0fe78c29af9a128efe` to
[Orvessian](https://orvessian.mjgrant.chatgpt.site/products/governance-preview).
Existing owner-only access was preserved. This publishes the marketing preview;
it does not activate paid plans, public access, customer onboarding or the private
development workspace backend. Build, 20 tests and targeted lint passed.

Current source: C:/AIChain/website. [Platform baseline](platform-architecture.md) and [review record](archive/2026-09-27/superseded-plans/documentation-review-2026-09-27.md) take precedence over earlier site phase plans.

## Positioning research — 27 September 2026

Direction approved 27 September 2026: lead with the governance platform and make
independently verifiable blockchain-anchored evidence the supporting differentiator.
Homepage and platform page source now reflect this direction; public publication
is a separate deployment step.
Reviewed official vendor pages; the descriptions below reflect their marketing,
not independently tested capabilities or a complete competitive feature audit.

| Competitor | Positioning emphasis | Implication for Orvessian |
|---|---|---|
| [LangSmith](https://www.langchain.com/langsmith/observability) | Agent tracing, quality evaluation, production monitoring and debugging | Agent visibility alone is an established category |
| [Arize](https://arize.com/) | Agent observability, evaluation and continual improvement for engineers | Show the business decision and outcome, with evidence, rather than promise another complete engineering suite |
| [Langfuse](https://langfuse.com/) | Open-source agent evaluation/observability, prompts, experiments, cost and latency | Generic dashboards and data portability alone are weak differentiation |
| [Fiddler](https://www.fiddler.ai/) | Enterprise agent control plane combining monitoring, evaluation, enforcement and governance | Do not call our reporting product a control plane without enforcement capabilities |
| [Credo AI](https://www.credo.ai/) | Enterprise AI/agent governance, discovery, policy and risk | Governance and audit evidence are already competitive claims |
| [Holistic AI](https://www.holisticai.com/) | Enterprise inventory, risk assessment and policy governance | Distinguish submitted activity coverage from automatic discovery |

Inference: the useful position to test is operational AI governance and reporting
with independently checkable decision evidence. This is a proposed combination
and customer-value hypothesis, not a claim that no competitor offers equivalent
assurance. Privacy also needs precision: several competitors offer self-hosted
options; our specific product boundary is structured governance records while
source conversations and documents remain customer-held.

Three messaging directions:

1. **Operational visibility:** “See how your AI agents are performing.” Clear
   daily value; needs strong activity, outcomes and reporting demonstrations.
2. **Governance and accountability:** “Make AI decisions visible. Make governance
   evidence checkable.” Closest to our combined platform and evidence strengths;
   recommended direction, introduced through operational customer questions.
3. **Evidence infrastructure:** “An independent record of your AI operations.”
   Useful for technical and audit audiences, but too narrow as the main platform
   story; retain as the supporting assurance explanation.

Implemented direction: “Understand your agents. Account for their decisions.”
The homepage uses an interactive illustrative dashboard, activity/outcome/
investigation cards and an explicit cryptographic evidence section. Navigation
leads to Platform, Plans, Use cases, Verification, Developers and the demo.
The platform page distinguishes current synthetic/pilot functionality from
planned heartbeats, alerts, incident ownership and scheduled reporting.
Use “tamper-evident anchored records,” not “the whole stack is immutable.”

## Brand and product presentation — 27 September 2026

Evolve the existing brand rather than replace it. Langfuse is the reference for
product visibility, concrete workflows and a direct demo path; retain Orvessian's
own identity, copy and illustrations. Do not borrow customer logos, adoption
numbers, certifications or integration claims.

| Colour | Token | Intended use |
|---|---|---|
| Deep navy | #10273A | Brand, navigation, key headings and evidence section |
| Amber | #FFAE42 | Primary actions and restrained headline emphasis; use dark text on amber |
| Cool off-white | #F7F8FA | Spacious marketing/product backgrounds |
| White | #FFFFFF | Product screens and cards |
| Slate | #455B70 | Secondary text on light surfaces |
| Pale blue | #A7C2D8 | Neutral activity charts, not success claims |
| Evidence green | #176447 | Explicit positive evidence examples/checks on white, always with a text label |

The homepage/platform marketing surfaces now use these colours. Other application
screens retain their existing styles pending a separate shared design-system
pass. Green is not an overall safety score; pending, missing and failed checks
must remain distinct. Colour alone must never communicate status. Maintain
keyboard focus, readable contrast and responsive layouts.

The homepage leads with agent governance and a broad, level product preview.
Activity and Outcomes show illustrative agent rows and review denominators;
Evidence shows separate example verification checks rather than a meaningless
trend chart. An expandable decision shows policy context, action and reported
outcome. All preview data is visibly illustrative; the demo link remains primary.

The governance narrative is **understand activity → review decisions → organise
the response → substantiate the account**. The first, second and evidence steps
have synthetic/pilot implementations. Rules, alert delivery and incident workflow
are labelled planned. Ownership, purpose and heartbeat status remain roadmap
items. Connect this narrative to operations, engineering and governance reviewers,
without implying autonomous discovery, runtime enforcement or universal AI safety.

Recommended homepage sequence: platform value and dashboard; reporting-agent and
decision-volume metrics; outcome/model comparison; submitted incidents; drill-down
from a trend to a decision and evidence export; data-handling explanation; then
technical assurance. Primary CTA should open the synthetic governance demo.
Keep the existing visual language, but make the portal the main product visual.

The first customer hypothesis is an AI/platform owner and operations reviewer
responsible for one consequential agent workflow. Test whether the demo helps
them investigate exceptions and prepare useful governance reports. Audit/risk
reviewers are supporting users; a global compliance replacement is not the
initial promise. Support or purchasing workflows give a concrete first example;
vehicle, robotics and legal views remain future domain profiles.

Capability boundaries: show agents reporting within a stated window, not agents
currently running; distinguish decisions from all submitted event types; show
outcome denominators and unlabelled records; separate submitted incidents from
automatic detections. Heartbeats/inventory, automated rules, alert delivery,
incident ownership and scheduled reporting are development candidates, not
available features. Missing events and source completeness cannot be inferred
from an intact on-chain commitment. Instrumentation adapters should be evaluated
to reduce integration effort, while preserving the no-source-content boundary.
