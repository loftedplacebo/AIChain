# Production release checklist — 14 October 2026

This is the current owner-facing checklist for a future **paid production**
service. It is separate from the [supervised synthetic design-partner gate](pilot-owner-actions.md#readiness-checkpoint--5-october-2026)
and the [staged partner-to-production roadmap](design-partner-to-production-roadmap.md).
Completing the hosted `test` pilot does not complete this checklist.
The [roadmap](roadmap-and-decisions.md) and linked evidence remain the detailed
engineering record.

On 11 October the owner selected isolated production application services on
the existing Contabo VPS for the initial release, with a later migration to a
dedicated VM when usage or revenue warrants it. The existing DigitalOcean
managed PostgreSQL cluster was repurposed exclusively for production. The
synthetic pilot now uses local PostgreSQL on Contabo.
The managed pilot databases and roles have been retired, and an empty
production database with three restricted `NOLOGIN` roles has been verified.
The reviewed production schema and runtime grants are installed. The restricted
API role now has a verified login and a root-only configuration file; the
migration and worker roles remain `NOLOGIN`. The production API now runs on
its separate loopback service for WorkOS revocation delivery only; customer
API and portal routes remain closed. An encrypted production database capture was uploaded to a
separate private B2 bucket using a restricted write key. Its completion marker
was discovered with a separate restricted read key, and the downloaded archive
passed authentication and a fresh closed restore on the Contabo loopback
recovery cluster. This capture has no worker journals because no production
worker exists yet. The closed prelaunch database now has a daily 02:00 UTC
encrypted B2 backup. Its first run passed an independent authenticated download
and closed local restore on 14 October; the private API restarted and backup
health passed. This zero-project schedule must be replaced with worker journal
coverage before Production project creation. The backup health check fails if
a project or worker appears under the
prelaunch schedule. A daily failure-only alert checks the completed window.
The archive key still needs independent escrow; reviewed retention,
replacement-host recovery, the worker credential,
WorkOS webhook acceptance and evidence-chain choice remain open. A
Production-only `session.revoked` endpoint was registered on 13 October with
the owner's approval for a short 404 transition. Its signing secret is now
stored root-only on Contabo; the private API is healthy and enabled, and only
the exact webhook path is public. Unsigned requests return 401, other
Production routes return 404, and the synthetic pilot remains healthy. No
Production user exists. A real signed WorkOS delivery and session-revocation
journey are still required for identity acceptance.
The isolated Production portal account, unit and pinned artifact are staged.
Its private loopback home and workspace pages returned 200 after the website
build and 44/44 release tests passed. The portal service is disabled and
inactive after the private test, and its public hostname still returns 404.
The ordered preparation and indicative budget are in the
[production transition sequence](production-transition-sequence.md).

## Business, identity and public information

- [ ] Establish the legal person or company that will provide the service,
  with the required registration, address, tax and contracting details.
- [ ] Create and test inbound domain email for privacy, support and security
  requests (for example `privacy@orvessian.com` and `support@orvessian.com`).
  WorkOS sends authentication messages; it does not provide these inboxes.
- [ ] Complete the [privacy and terms drafts](public-legal-pages-review.md),
  review their actual processing facts and publish `/privacy` and `/terms` with
  working footer and sign-up links before broad public onboarding.
- [ ] Agree real-data controller/processor terms, retention/deletion and
  incident-notification responsibilities with each customer. Complete the
  cookie/analytics inventory and any required visitor choices.

## Production product and access

- [ ] Deploy and accept one hosted Production environment with its own WorkOS
  Production identity, exclusive managed database and non-owner roles,
  storage, signing/relayer keys, secrets,
  backups and provider configuration. Keep the existing hosted synthetic pilot
  until cutover evidence passes, then use isolated local development with WorkOS
  Staging for routine tests. Use short-lived isolated HTTPS previews only where
  local testing cannot exercise callbacks, webhooks or release behavior.
  Rehearse account/workspace transition and rollback; staging identities and
  pilot keys do not transfer automatically. Start with free hosted Production
  AuthKit; a paid custom login domain is deferred.
- [ ] On the shared Contabo host, verify separate production Unix users,
  services, ports, protected files, edge routes and resource limits. Test that
  a pilot release or fault cannot alter production state, and document the
  shared host outage and administrator risk. Rehearse moving the production
  app to a dedicated VM without moving its managed database.
- [ ] Before production access, prove that pilot credentials cannot access
  production, and verify separate encrypted backup and journal coverage.
  Measure production cluster capacity and rehearse recovery to a replacement
  cluster before promising availability beyond the single-node design.
- [ ] Pass the complete customer journey: registration/admission, MFA and
  recovery, organizations and roles, scoped API keys, first submission,
  revocation, signed evidence, independent export verification and deletion.
- [ ] Finish security and abuse controls, including edge and pre-authentication
  limits, privileged access review, audit history, secret rotation and a
  reviewed security test appropriate to the public service.

## Reliability, support and commercial release

- [ ] Rebuild from an unavailable managed database cluster and activate a
  reviewed restored service from independently held encrypted backups. Measure
  recovery point/time against targets; test backup alerts and retention.
- [ ] Monitor portal/API health, saturation, evidence backlog, WorkOS
  revocation coverage, on-chain publishing, backups and customer-impacting
  failures. Name support and incident owners and rehearse pause/rollback.
- [ ] Measure realistic load and response times, then set tested capacity,
  quotas and service commitments before advertising them.
- [ ] Approve actual plans, prices, billing units, metering, overage/cap
  behavior, taxes, invoices, refunds and support terms; test checkout and
  cancellation. Current website prices are indicative.
- [ ] If production evidence will use Base mainnet, separately approve the
  contract, wallet/key custody, gas budget, monitoring, recovery and
  independent receipt verification. Base Sepolia pilot evidence is testnet only.
- [ ] Obtain an explicit owner go/no-go decision backed by the release evidence,
  customer/support procedures and public claims review.

The operator project's managed-PostgreSQL record has already reached its
separate worker, signed receipt, Base Sepolia anchor and independent verifier.
For several partners, extend worker, journal backup and monitoring coverage to
each project as described in the [staged roadmap](design-partner-to-production-roadmap.md).
That synthetic pilot evidence does not pass the production gates above.
