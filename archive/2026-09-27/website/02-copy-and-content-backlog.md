# Draft website copy and content backlog

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

14 September 2026 · Reviewable copy, not published · Availability claims must be rechecked at implementation

## Homepage proposal

**Category:** Independent verification infrastructure for AI.

**Headline:** Run your AI anywhere. Make the record independently checkable.

**Supporting copy:** Orvessian is building the developer tools and open network for recording selected AI actions, retaining private evidence and checking that the record matches its commitments. Your application runs the AI. Reviewers can inspect exactly which checks passed and which remain unknown.

**Current primary CTA:** Explore the receipt tooling → `/developers`.

**Current secondary CTA:** See the example workflow → `/in-action`.

**Stage label:** Local receipt tooling and integrated alpha demonstrated. Managed verification service in development. Closed-testnet release gates remain open.

When partner intake exists, add “Discuss a founding partner pilot” pointing to the real programme page. When the managed quickstart passes, change the developer CTA to “Create your first verified record” with the exact check scope explained on the destination page.

## Product split copy

**For developers — Verification SDK and API**

Add a receipt to selected events in the applications you already run. The planned managed service handles submission, retries and confirmation tracking. Keep the evidence in your own infrastructure and export what a reviewer needs.

**For reviewers — Evidence that can be checked**

Compare authorised evidence with its recorded commitment, inspect signatures and check network inclusion. Each result states its scope. An unchanged record does not guarantee that the original information was true.

**For the ecosystem — An open verification network**

The network is designed to support direct use by developers and independent validation by node operators. The commercial platform makes that infrastructure easier to use. Public network participation is subject to the current release status.

## How it works

1. Your AI application completes a selected event.
2. Your integration creates a signed receipt from evidence commitments.
3. Private evidence and its openings remain with the chosen custodian.
4. The receipt or its batch commitment is submitted to the network.
5. A reviewer obtains the permitted evidence and independently checks supported properties.

Avoid wording that says miners check the truth of every decision. A miner secures the chain; a verifier evaluates a specified claim using evidence.

## Proposed status-page update

**Project status — 14 September 2026.** This is a dated development summary, not a live uptime monitor.

**Integrated alpha:** the latest engineering sign-off records Phase 3 completed with documented limitations, including bounded receipt/proof, governance and network experiments.

**Receipt tooling:** general 0.4.0-alpha local tooling supports evidence commitments, profiles and signed presentations. The separate authorised AVR path supports the existing historical-authority and scoped policy-proof work.

**Closed testnet:** deployment foundations, monitoring and acceptance harnesses exist. Full hardware-diversity, independent-operator and acceptance evidence remains to be established before claiming Phase 4 complete.

**Commercial platform:** a managed customer API, published supported SDK, customer accounts and commercial evidence operations are proposed next work. No production service or customer adoption claim is made here.

Source links should point to the reviewed revision of `docs/phase3-signoff-tracker.md`, `docs/verification-receipt-readiness-review.md` and `docs/phase-4-closed-testnet-foundation.md`. Record the revision in the site's claim ledger; do not rely on a moving `main` link for a frozen numerical claim.

## Proposed partner-page copy

**Help shape a practical verification workflow for AI.**

We are preparing a small founding-partner programme for AI teams whose customers need inspectable evidence of selected agent actions. The first pilots will focus on one workflow, customer-controlled evidence and a record another party can check.

The proposed programme includes scoped integration help, capped trial usage and direct engineering feedback. It is an experimental service with explicit network and assurance limits. Participation does not require buying a token. Availability and trial terms will be confirmed with each partner.

The enquiry form should request work email, company, workflow summary, integration stack and who needs to review the evidence. It must warn against submitting confidential prompts, documents or credentials. Do not publish the form until it stores or routes enquiries to a real accountable owner and has appropriate notices.

## Claim ledger

| Claim | Can be used now? | Required source / condition |
|---|---|---|
| General local receipt tooling exists | Yes, alpha qualified | Existing guide and fresh scoped tests |
| Phase 3 signed off | Yes, with limitations and date | Latest sign-off tracker |
| Phase 4 complete | No | Full acceptance evidence and release review |
| Managed SDK/API available | No | Published package, actual service and onboarding test |
| Public explorer/faucet live | Not established | Approved public endpoints and verification |
| Evidence always private | No absolute claim | Describe exact on/off-chain fields and custody choice |
| Model execution proven | No blanket claim | Specific authenticated evidence/proof for exact claim |
| 10–15 companies / 50,000 weekly actions | Target only | Auditable usage cohorts before using present tense |
| Production TPS or guaranteed finality | No | Workload-specific production evidence and qualified semantics |
| Certified compliance | No | Specific independently established certification if ever applicable |

## Implementation order

WEB-01: update home/product/status language and metadata, preserve current visual components. WEB-02: add the product/network distinction and assurance explanation to technology/developer pages. WEB-03: build real partner intake when ownership/data handling are ready. WEB-04: replace illustrative managed snippets only with a tested supported SDK journey. WEB-05: attach a real synthetic SDK-generated receipt to the existing story after P1, keeping the human narrative clearly illustrative. WEB-06: publish versioned technical paper and permissioned case studies after evidence review.

Do not rewrite the complete interactive story, replace existing artwork, or launch a customer console merely to implement this positioning change.

## Safety-monitoring copy addition

**Dedicated-page headline:** When AI acts, keep the controls around it checkable.

**Supporting copy:** Orvessian is building an independent evidence layer for selected agent permissions, monitoring signals and human interventions. Your security controls still isolate, block and stop risky behaviour. The receipt helps authorised reviewers inspect what those controls recorded.

**Non-claim directly below it:** A verification record does not prevent a sandbox escape, guarantee complete detection, prove an agent was safe or replace a runtime security control.

**Network explanation:** The network is designed to make a recorded commitment harder to alter silently than a record kept only in the AI operator’s database. It does not make an agent, sandbox or application immune to AI-assisted attack.

Link to the technical status page and the relevant profile/example only once live. The supporting research and product boundary are in [AI safety, monitoring and verification positioning](../business/07-ai-safety-monitoring-positioning.md).

The dedicated explanatory page, homepage feature, Product capability, Developers availability note, Technology boundary and Status roadmap entry are now present in the site source. Keep “planned” language until the profile and gateway example pass their testnet gates.
