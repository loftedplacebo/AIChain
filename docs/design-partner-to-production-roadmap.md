# From design partners to production — 5 October 2026

This is a planning view, not a release approval or delivery commitment. The
current hosted environment is a supervised synthetic `test` pilot. An approved
partner can have a complete product experience there without representing it
as a production service or accepting real customer data.

| Stage | Partner experience | Work before moving on | Exit evidence |
| --- | --- | --- | --- |
| **Now: operator pilot** | Public site, waitlist, MFA, portal, API key, synthetic ingestion, signed export and Base Sepolia check have been tested in the operator project. | Identify first partner and agree synthetic workflow, fields, contacts and support. | Current [pilot owner record](pilot-owner-actions.md). |
| **A: first partner API test** | An approved named partner signs in, creates an isolated workspace/project and uses a short-lived key for supervised synthetic submit and read-back. Signed evidence may be pending. | Test that exact new project's access and isolation before handing over a key; agree a small test window and allowed fields. | One partner-owned event accepted and read back, duplicate retry safe, key revoked. See the [provisional checklist](examples/first-design-partner-synthetic-pilot-proposal.md#provisional-partner-onboarding-checklist). |
| **B: complete supervised evidence trial** | Partner submits the agreed synthetic set and reviews independently verifiable signed evidence in the portal. | Provision a reviewed instance of the existing worker code for the partner project; include its journal in coordinated encrypted backup and restore; monitor that project's evidence backlog; agree support, pause and exit. | Partner project passes submission, portal reconciliation, signed export/Base Sepolia verification, backup restore review and key retirement. |
| **C: repeatable multi-partner pilot** | Several approved partners can use the same onboarding journey without bespoke code changes for each one. | Standardize operator-run project worker provisioning, protected key custody and testnet funding; capture and restore every worker journal; discover and monitor every project; exercise fresh-account first use, quotas and load. The existing two-step WorkOS/API approval can remain manual for a small cohort. | At least two independent partner projects pass isolation, simultaneous evidence work, recovery and alert tests. A named owner signs off the supported pilot capacity. |
| **D: production release** | The service can accept the data and commitments explicitly approved for its production terms. | Complete the separate business, legal, security, production infrastructure, recovery, support and commercial gates below. | A reviewed production environment passes its own end-to-end customer, security, recovery and operations acceptance; owner records go/no-go. |

## What is reusable

The portal's approved-user sign-in, workspace/project creation, scoped key
lifecycle, API and one-project evidence worker are implemented. The worker code
already takes an explicit tenant/project, signer, relayer and journal. For a
small pilot cohort, use separate configured worker **instances** of that same
code, not a new codebase per partner. Keep project journals and relayer nonce
ownership separate. A shared dynamic multi-project publisher is a later design
choice that needs its own concurrency, custody and recovery review.

The current backup includes the PostgreSQL database, which holds all projects,
but its coordinated stop list and archive name **one** hosted worker journal.
The runtime/evidence health check also names one worker and one project.
Neither becomes multi-partner coverage merely because the API can create a new
workspace. WorkOS waitlist approval also needs a separate exact-email API
admission update today.

Local Stage C development now has a [repeatable multi-project worker and
recovery procedure](pilot-multi-project-workers.md), including per-project
provisioning, bounded multi-journal archives and project-wide health checks.
The native synthetic PostgreSQL recovery test passes for two worker journals.
The hosted VPS has not yet been migrated to the protected registry or passed
the two-project B2 and alert drills, so Stage C exit remains open.

## Additional production gates after Stage C

These are the main differences between a polished synthetic pilot and a
production service. Use the [production release checklist](production-release-checklist.md)
for the owner-facing detail and the [roadmap](roadmap-and-decisions.md) for the
technical evidence.

1. **Organisation and agreements:** establish the provider company, working
   support/privacy/security inboxes, publish reviewed privacy and terms pages,
   and agree the real-data processing, retention, deletion and incident terms
   appropriate to the intended customers.
2. **Separate production environment:** deploy and test production WorkOS,
   database, storage, secrets and signing/relayer configuration separately
   from the pilot. Rehearse migration and rollback; do not carry pilot keys
   or test accounts across by assumption.
3. **Security and access:** review privileged access, logs/audit, secret
   rotation, edge and authentication abuse controls, account recovery and
   deletion. Test the full customer journey with production configuration.
4. **Recovery and operations:** restore to a replacement cluster when the
   original is unavailable, review and activate the restored service, measure
   actual recovery time and data loss, and test customer-impacting alerts,
   on-call ownership, pause and rollback. The present closed restore in the
   same cluster does not establish this.
5. **Capacity and product promises:** measure multi-project load, evidence
   latency and failure behavior; set tested quotas and support commitments.
   Decide and test the production evidence chain and key/gas custody. The
   pilot's Base Sepolia anchors are testnet evidence.
6. **Commercial release, if paid:** approve plans, billing and tax treatment,
   checkout, invoicing, cancellation and customer support terms, then test
   those journeys before charging.

## Indicative effort and dependencies

Assuming one engineer focused on the existing code, manual WorkOS/API approval,
operator-run worker provisioning and a small synthetic cohort, the Stage B/C
technical work is roughly **three to six focused engineering days**. The main
pieces are a reusable per-project worker instance/configuration, multi-journal
backup and restore, per-project health checks, and a fresh-account end-to-end
test. The backup archive currently accepts only one journal with the `worker`
role, so that part needs a real format/recovery change. These are planning
ranges, not tested schedules; unexpected recovery or isolation failures could
add time. Automating approval and worker provisioning for open-ended self-service
is a separate project. Stage D is another program whose duration depends on
real-data scope, legal and company setup, the production evidence-chain choice,
security findings, and the replacement-cluster recovery drill. Estimate it
after the first partner workflow and data boundary are agreed.

For the first partner, the next actionable sequence is: agree the synthetic
brief; complete Stage A's separate-project smoke test; then deploy, back up,
monitor and verify that project's worker for Stage B. Stage C can be built
while the supervised trial is running, using the observed partner workflow.

## Separate engineering task — scheduled synthetic OpenAI workload

- [ ] Create a dedicated internal synthetic test workspace/project and a
  short-lived Orvessian submission key. Keep it separate from design partners.
- [ ] Run a bounded synthetic agent task on a timer using the OpenAI Responses
  API. Use a dedicated OpenAI Platform project key with protected VPS storage,
  expiry/rotation, usage monitoring and a spend limit. Do not send partner data.
- [ ] Convert only validated, allowlisted outcome metadata into governance
  events; do not submit raw prompts or model responses. Use stable event IDs
  for retries, a low fixed run frequency, timeouts and a pause switch.
- [ ] Verify API acceptance, portal read-back, evidence-worker processing and
  independent signed export/Base Sepolia checks. Alert on failed or missing
  runs without treating generated outputs as ground truth.

This is an internal product exercise and an end-to-end canary, not a design
partner or a production availability claim. It needs an OpenAI API account,
billing/spend configuration and a separate protected API key before activation.
