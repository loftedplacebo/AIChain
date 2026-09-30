# Owner actions for the supervised design-partner pilot

This is the short owner-facing queue. The [roadmap](roadmap-and-decisions.md)
tracks engineering and release checks. The first partner trial uses synthetic
records; none of the actions below alone makes the hosted platform ready.

## Decisions already made

- Application and partner portal: existing Contabo VPS for the pilot, subject to
  hosted capacity, isolation and browser checks.
- Database: DigitalOcean managed PostgreSQL; London is the planned region.
- Independent encrypted backups: Backblaze B2 EU Central. Daily complete
  database-and-journal capture, 14-day retention, 24-hour RPO/RTO targets and a
  tested restore before partner access.
- Use `orvessian.com` as the pilot domain, subject to availability and purchase.
  Proposed public website at the apex/`www`, partner portal at `portal.`, API at
  `api.`. Make the marketing website public once the domain resolves over HTTPS
  and its visitor view has passed a smoke check. Keep portal access limited to
  named users. After the design partners, review long-term hosting before
  paying customers.
- Require MFA for pilot portal sign-in. An authenticator app (TOTP) is the
  preferred method; verify WorkOS policy/enrolment and an account-recovery route
  before inviting anyone. The provider policy has not been switched on yet.

## Your next actions and choices

- [ ] **Check and buy `orvessian.com`** if it is available at an acceptable
  first-year and renewal price. Buy it after
  reviewing the registrar's order. Use Cloudflare for DNS and proxy protection
  on the VPS `portal.` and `api.` hosts. The website's existing Sites custom
  domain is conditional on that setting being available and its DNS instructions.
- [ ] **Set up an authenticator app for your pilot operator login** when the
  isolated WorkOS pilot environment is ready. We will configure and test the
  required MFA policy and recovery process before partner accounts are invited.
- [ ] **Make the marketing website public when `orvessian.com` is live.** First
  confirm its HTTPS certificate, DNS routing and signed-out visitor view. The
  current Site is owner-only. Portal access stays limited to named pilot users
  after the hosted acceptance check.

## Account setup for the technical pilot

- [ ] Ensure you control the DigitalOcean account/payment method and the
  Backblaze B2 account in EU Central; do not create live data resources until
  the reviewed setup is ready. We will supply exact cluster/bucket settings and
  run connection and restore acceptance.
- [ ] Put provider login identifiers and password-manager item references in
  the ignored `C:/AIChain/.env.providers` inventory. Keep passwords, API keys,
  database URLs with embedded credentials and backup encryption keys out of Git
  and the public website. The inventory still has `TO_RECORD` fields because
  those account details have not been provided or verified.

## Engineering work after those choices

Verify Sites' Add domain setting; build the VPS portal/API routing and Cloudflare
Full (strict) HTTPS; configure exact WorkOS callbacks and webhooks; provision
separate database roles and B2 access; run the complete synthetic browser,
receipt, backup and restore acceptance. No public DNS or provider account has
been changed by this checklist.

## After technical setup

Choose the first design partner and one workflow, name a technical contact and
reviewer, agree the synthetic fields and success measures, and use a separate
[pilot brief](examples/design-partner-pilot-brief-template.md) for each partner.
