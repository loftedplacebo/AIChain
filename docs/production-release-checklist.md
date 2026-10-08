# Production release checklist — 5 October 2026

This is the current owner-facing checklist for a future **paid production**
service. It is separate from the [supervised synthetic design-partner gate](pilot-owner-actions.md#readiness-checkpoint--5-october-2026)
and the [staged partner-to-production roadmap](design-partner-to-production-roadmap.md).
Completing the hosted `test` pilot does not complete this checklist.
The [roadmap](roadmap-and-decisions.md) and linked evidence remain the detailed
engineering record.

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
  Production identity, database, storage, signing/relayer keys, secrets,
  backups and provider configuration. Keep the existing hosted synthetic pilot
  until cutover evidence passes, then use isolated local development with WorkOS
  Staging for routine tests. Use short-lived isolated HTTPS previews only where
  local testing cannot exercise callbacks, webhooks or release behavior.
  Rehearse account/workspace transition and rollback; staging identities and
  pilot keys do not transfer automatically. Start with free hosted Production
  AuthKit; a paid custom login domain is deferred.
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
