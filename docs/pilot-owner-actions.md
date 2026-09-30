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
- Buy an Orvessian domain during pilot preparation. Proposed public website at
  the apex/`www`, partner portal at `portal.`, API at `api.`. The exact name and
  purchase are still open. After the design partners, review long-term hosting
  before paying customers.

## Your next actions and choices

- [ ] **Choose the exact domain name** (for example, `orvessian.com` if it is
  available) and an acceptable first-year and renewal price. Buy it after
  reviewing the registrar's order. Use Cloudflare for DNS and proxy protection
  on the VPS `portal.` and `api.` hosts. The website's existing Sites custom
  domain is conditional on that setting being available and its DNS instructions.
- [ ] **Confirm the pilot sign-in rule.** Recommendation: require MFA for every
  invited partner and Orvessian operator account, not only administrators.
  Choose a workable recovery route for a lost authenticator before invitations.
- [ ] **Pick the first design partner and one workflow.** Name a technical
  contact and a reviewer, decide the synthetic fields they may send, and agree
  what would count as a useful trial. Use a separate
  [pilot brief](examples/design-partner-pilot-brief-template.md) for each partner.
- [ ] **Decide when the marketing website becomes public.** The current Site is
  owner-only. Partner portal access remains limited to named pilot users after
  the hosted acceptance check.

## Account setup once the domain and pilot scope are settled

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
