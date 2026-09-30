# Design-partner pilot brief — working template

Use one copy per prospective partner. This is an internal scoping worksheet, not
an invitation, contract, data-processing agreement or statement that the hosted
customer service is ready. Keep it outside the public website until its facts and
terms are reviewed with the partner.

## Partner and workflow

| Question | Agreed answer |
| --- | --- |
| Organisation and named technical contact | To agree |
| Named business reviewer | To agree |
| One AI workflow to observe | To agree |
| Decision or outcome the reviewer needs to understand | To agree |
| Existing source system and owner | To agree |
| Pilot start, end and check-in dates | To agree |

Describe one example as: “When **[agent or application]** performs **[task]**,
the reviewer needs to see **[decision and outcome]** and check **[evidence]**.”

## Data and access boundary

- First supervised trial: synthetic or explicitly non-sensitive structured
  records only. Do not send prompts, conversations, documents, media, raw sensor
  streams or another person's production data.
- List the exact fields the integration may send, including agent, deployment,
  decision, outcome and reference IDs. Mark each as supplied, omitted or derived.
- Record who may sign in, submit records, review them and export evidence. Use
  separate scoped keys for the integration; record their expiry and revocation owner.
- Record any additional data/security agreement required before using real
  operational records. A successful synthetic trial does not grant that approval.

## What the partner will try

1. Sign in, select a workspace and project, and connect one application.
2. Submit a small synthetic set containing a normal outcome, an unresolved
   outcome and one exception worth reviewing.
   For a content-free rehearsal, use
   [`design-partner-synthetic-set.py`](../../examples/design-partner-synthetic-set.py):
   set `ORVESSIAN_TENANT` and `ORVESSIAN_PROJECT` to the portal's project
   references, then run `python examples/design-partner-synthetic-set.py prepare
   pilot-set.json`. Set `ORVESSIAN_API_URL` to the approved test API origin and
   `ORVESSIAN_API_KEY` to a test project's write-scoped key, then run the same
   script with `submit pilot-set.json`. The file contains three fixed synthetic
   records and no key or source content. Keep it private and reuse that exact
   file when retrying; a second `prepare` creates different IDs. Set a separate
   read-scoped key as `ORVESSIAN_READ_API_KEY` and run `check pilot-set.json`
   to compare the three stored records with the prepared file. Then inspect
   those IDs in the portal. The API check proves neither the portal view nor
   signed receipt/Base inclusion; keep the independent export step below.
3. Find the records in the portal; check that totals and missing-data labels
   agree with the submitted set.
4. Review one decision and attach a human outcome or investigation note.
5. Export one eligible record and independently check its signed receipt and
   Base Sepolia anchor with an explicitly trusted recording signer and a
   read-only chain source. The [offline export verifier](../governance-receipt-base-integration.md#operator-workflow)
   must return verified (exit 0) for the acceptance sample. Record pending or
   unavailable evidence separately; an API or portal summary is not independent proof.
6. Revoke the submission key and confirm a new submission is refused.

## Success measures

Agree target values with the partner before starting; do not invent a universal
pass threshold. Record the observed result and the exact capture boundary.

| Measure | Target | Observed result |
| --- | --- | --- |
| Time from access granted to first accepted record | To agree | Pending |
| Time from accepted record to checkable export | To agree | Pending |
| Reviewer can locate and explain one decision | To agree | Pending |
| Submitted records reconciled with scoped portal totals | To agree | Pending |
| Evidence export passes independent verification | To agree | Pending |
| Missing or delayed evidence is labelled correctly | To agree | Pending |
| Integration and reviewer effort judged useful by partner | To agree | Pending |

## Operating agreement for the trial

- Name Orvessian's support contact and the partner's escalation contact.
- State expected trial availability and response process without implying a
  production SLA. Define how either side pauses submissions.
- Agree how records and exports are returned or deleted at the end of the trial,
  subject to a reviewed retention policy and any applicable terms.
- Record known limitations: supervised pilot, Base Sepolia testnet, no automatic
  correctness or completeness proof, no live enforcement, no active billing.

## Start decision

Do not issue a partner credential until the hosted synthetic-data acceptance
check has passed: accessible portal and API, account/role/key lifecycle, first
record, independently verified export, basic monitoring and named support.
Record the approving owner, date and evidence links here.
