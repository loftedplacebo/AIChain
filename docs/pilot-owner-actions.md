# Owner actions for the supervised design-partner pilot

This is the short owner-facing queue. The [roadmap](roadmap-and-decisions.md)
tracks engineering and release checks. The first partner trial uses synthetic
records; none of the actions below alone makes the hosted platform ready.

## Readiness checkpoint — 5 October 2026

The public website, hosted admitted-user portal/API, required MFA, first synthetic
submission, signed webhook, daily encrypted B2 backup and same-cluster restore
drill are operating. The separate hosted worker signed and anchored the first
managed-PostgreSQL record on Base Sepolia; an independent export verifier passed
at 19 confirmations. A read-only check on 5 October found the portal, API,
hosted worker, backup timer and revocation replay timer active, with no current
Synthetic Validation evidence backlog. **Partner outreach and pilot
scoping can begin; partner credentials remain gated** by the
[provisional partner checklist](examples/first-design-partner-synthetic-pilot-proposal.md#provisional-partner-onboarding-checklist).
The limited API smoke test has a smaller gate than the full evidence trial.

Before inviting an approved applicant into the portal:

- [x] Accept one hosted managed-PostgreSQL record through the separate worker,
  obtain its signed receipt and Base Sepolia anchor, and pass the independent
  export verifier. See the [hosted integration record](hosted-pilot-application-integration.md#hosted-evidence-worker-and-anchor--4-october-2026).
- [x] Test a non-operator waitlist request, review, allowlist update, WorkOS
  approval, required MFA sign-in, workspace access and denial path end to end.
  The 5 October request, exact-email API admission, WorkOS deny and approve
  transitions passed. WorkOS then showed an accepted invitation, verified
  user, sign-in and enrolled TOTP factor. The owner confirmed successful
  Orvessian workspace sign-in. The owner then observed workspace sign-in blocked
  while only this test email was temporarily removed from API admission; the
  exact email was restored and the API is active. The owner confirmed a fresh
  workspace sign-in after restoration. See the
  [admission drill](hosted-pilot-application-integration.md#second-account-admission-drill--5-october-2026).
- [x] Test hosted project-key revocation and basic resource, evidence backlog
  and session-revocation monitoring with a named alert/support owner and a
  documented way to pause submissions. The disposable one-day key accepted
  one hosted record (HTTP 201), then portal revocation after fresh sign-in
  caused the same secret to be rejected (HTTP 401). Michael Grant accepted
  primary pilot support and incident ownership on 5 October. The runtime and
  evidence alert runs daily at 09:00 Europe/London while the pilot is idle;
  restore its 30-minute cadence for an active partner submission window. The
  one-minute WorkOS revocation replay remains active;
  a bounded API pause/resume rehearsal passed. These checks cover the current
  Synthetic Validation project. See the
  [support runbook](pilot-support-and-incident-runbook.md).
- [ ] Agree the first partner, one synthetic workflow, fields, contacts, dates,
  success measures and trial support/exit procedure in a copy of the pilot
  brief. A [proposed internal brief](examples/first-design-partner-synthetic-pilot-proposal.md)
  now supplies a candidate workflow, fields and measures. Partner-specific
  acceptance and a separate partner-project worker, backup and monitoring
  scope remain open. The proposal now separates a one-day, supervised
  ingestion-only API smoke test from the later evidence trial. Review the
  public privacy/terms copy before broad waitlist promotion.

The B2 restore tested a new closed database in the existing cluster. A
lost-cluster rebuild and restored-service activation remain later recovery
work; do not describe the 24-hour RTO as measured.

## Decisions already made

- Application and partner portal: existing Contabo VPS for the pilot, subject to
  hosted capacity, isolation and browser checks.
- Database: DigitalOcean managed PostgreSQL; London is the planned region.
- Independent encrypted backups: Backblaze B2 EU Central. The current hosted
  pilot captures its PostgreSQL database and separate hosted evidence-worker
  journal daily. The B2 lifecycle targets 14-day visibility,
  with 24-hour RPO/RTO targets and a tested same-cluster restore.
- `orvessian.com` was purchased through GoDaddy on 3 October 2026. The apex and
  `www` DNS records and Site custom domains are active with HTTPS. The marketing
  Site is public, and a signed-out home-page check passed. Partner portal
  `portal.` and API `api.` now serve the isolated synthetic pilot for the operator
  and one owner-controlled second test account;
  partner admission remains closed. After the design partners, review
  long-term hosting before paying customers.
- Require MFA for pilot portal sign-in. WorkOS requires TOTP in the pilot
  staging environment; operator enrolment, password reset and factor recovery
  were reported tested on 4 October. Verify each admitted partner's enrolment.

## Your next actions and choices

- [x] **Buy and connect `orvessian.com`.** GoDaddy remains authoritative DNS;
  the Site's built-in Cloudflare custom-domain service handles the marketing
  hostnames. The VPS `portal.` and `api.` hosts now serve the admitted-user
  synthetic pilot over HTTPS.
- [x] **Finish authenticator-app enrollment at the first pilot sign-in.** The
  isolated `Orvessian Pilot Test` staging environment now requires MFA and
  disables Enterprise SSO. Public requests enter a WorkOS waitlist and need
  manual approval plus a separate API email allowlist update. The invitation to
  `mjgrant@live.co.uk` was accepted and its email verified. Hosted browser
  sign-in succeeded on 4 October 2026; a read-only WorkOS API check showed a
  recorded sign-in and one enrolled TOTP factor. On 4 October, the owner
  reported a successful password reset and fresh sign-in with the new password
  and TOTP code. The owner also reported testing restoration of the
  authenticator entry on another device or from a protected backup.
- [x] **Make the marketing website public.** Apex and `www` HTTPS, DNS routing
  and a signed-out visitor view passed on 3 October 2026. The Site now links to
  hosted sign-in/request access beside the demo; partner portal access remains
  gated by hosted acceptance and named-user controls.

## Account setup for the technical pilot

- [x] Create the DigitalOcean account and selected synthetic `test` PostgreSQL
  cluster. Provisioning and configuration are tracked in the
  [cluster setup record](digitalocean-pilot-cluster-setup.md); its existence does
  not pass hosted or recovery acceptance.
- [x] Ensure you control the Backblaze B2 account in EU Central. On 4 October
  2026, the account settings showed EU Central, verified email and two-factor
  sign-in. Created the private `orvessian-pilot-test-backups` bucket with
  Backblaze-managed server-side encryption. A custom lifecycle rule hides
  objects after 14 days and deletes hidden versions after at least one more
  day; Backblaze applies rules daily. Object Lock remains disabled. Bucket
  provisioning and encrypted PostgreSQL capture/upload are complete.
  The first B2 backup ID is `be147819-f1cd-4a8e-8e85-0ae6736ef5a9`.
  The separate read-only B2 key downloaded and authenticated that set, and a
  fresh restore to `gov_restore_b2_675760d159ba` passed review with access
  closed. A 03:00 UTC daily systemd timer is enabled and its unattended service
  completed backup ID `f0fabc1b-96e3-4532-a44d-7448ac80fb7a`. External
  failure notification in this chat is active through a daily 05:30
  Europe/London read-only health check. A timed B2 restore of the latest
  scheduled backup passed in 8.25 seconds into a new closed database in the
  same DigitalOcean cluster. Full-cluster recovery time remains unmeasured.
- [ ] Put provider login identifiers and password-manager item references in
  the ignored `C:/AIChain/.env.providers` inventory. Keep passwords, API keys,
  database URLs with embedded credentials and backup encryption keys out of Git
  and the public website. The pilot WorkOS, AuthKit, sealing-key and synthetic
  test-key item titles are recorded; other provider login details still have
  `TO_RECORD` fields.

## Engineering work after those choices

The `portal.` and `api.` A records resolve to the existing VPS. A single Let's
Encrypt certificate covers both names and expires on 1 January 2027. Nginx
serves HTTPS for both names and proxies the admitted-user synthetic portal/API.
The Contabo
network firewall has an inbound TCP 80/443 rule for any IPv4 source, matched by
Ubuntu UFW rules. Public HTTPS and the HTTP ACME challenge path passed on both
names. Certbot uses the webroot challenge for automatic renewal, reloads Nginx
after renewal, and passed a simulated renewal; its systemd timer is enabled.
Keep the `/.well-known/acme-challenge/` route and port 80 available when
replacing the holding configuration. The standalone pilot portal and API run on
VPS loopback under separate service accounts and start automatically. The
protected API runtime configuration passed restricted PostgreSQL preflight;
  WorkOS signed webhook delivery passed through the public edge. Operator sign-in,
  a one-record synthetic API submission, and inspection of that record in the
  hosted Decisions view have passed. [The integration record](hosted-pilot-application-integration.md)
  tracks account recovery, secret inventory and escrow, and backup/restore
  acceptance. Partner access remains closed by the exact-email admission list;
  it currently contains the operator and one owner-controlled test account.

## After technical setup

Choose the first design partner and one workflow, name a technical contact and
reviewer, agree the synthetic fields and success measures, and use a separate
[pilot brief](examples/design-partner-pilot-brief-template.md) for each partner.
