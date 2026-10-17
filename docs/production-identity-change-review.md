# Production identity change review — 14 October 2026

## Configured in WorkOS Production

The **Orvessian Production** application belongs to WorkOS environment
`environment_01M3MRQT3RWYTFAGZEVCFV0M0E`, client
`client_01M3MRQT8SN9VYRYGQBJWDXAP1`. The pilot uses a different Staging
environment and client. WorkOS Production has hosted AuthKit, password
sign-in, required authenticator-app MFA, email verification, and breached-
password checks. Public sign-up is closed. Radar remains Off under the
owner's billing choice. The Production environment has zero users.

The default application now has exactly one callback,
`https://prod.orvessian.com/api/auth/callback`, one logout return,
`https://prod.orvessian.com/workspace`, and one web origin,
`https://prod.orvessian.com`. Its homepage is the workspace URL and its
initiate-login URL is `https://prod.orvessian.com/api/auth/start`. These are
temporary production preparation hostnames; the pilot continues at
`portal.orvessian.com` and `api.orvessian.com`. The corresponding production
API hostname is `api-prod.orvessian.com`. DNS and TLS are configured. The
Production API runs on a separate private loopback service. The owner sign-in
preview serves the portal and exposes only WorkOS sign-in/session routes.
Project, key and general API routes remain 404.

The [non-secret topology plan](../deploy/governance/deployment-plan.example.json)
contains these URLs and the WorkOS Production identifiers. Its validator
passes with `releaseReady:false`, as intended.

## Application-side identity guard

The portal must start with `WORKSPACE_ENVIRONMENT=prod`,
`WORKSPACE_ORIGIN=https://prod.orvessian.com`, and
`GOVERNANCE_API_URL=https://api-prod.orvessian.com`. The gateway rejects an
unlabelled deployment on `prod.orvessian.com` and refuses the production
sign-up route. The sign-in screen presents an invited-account message there
instead of the synthetic-pilot account link.

The API's production identity configuration must set
`GOVERNANCE_ENV=prod`, `WORKOS_ADMISSION_MODE=production-list`, the exact
Production client and callback above, and a protected
`WORKOS_PRODUCTION_ALLOWED_EMAILS` list. Pilot admission fields cannot be
used for this mode. This is an initial closed admission control while public
production sign-up remains unapproved. The server-side callback and session
renewal both recheck the list. Offline tests cover wrong client, callback,
environment and list, plus a rejected production sign-up start.

## Pending before an end-to-end production sign-in

1. The restricted Production database role, schema, private API service,
   portal artifact and exact DNS/TLS binding are configured. The API is
   active and enabled on `127.0.0.1:8791`; `/health` and `/ready` passed
   privately. The portal is active but disabled for boot, and the owner
   preview exposes only sign-in/session routes. Project and key routes remain
   404. Check shared-host capacity and rollback before enabling customer
   traffic. A dedicated production VM is a later migration.
2. The owner installed a distinct WorkOS Production API key through the
   hidden-prompt installer. A distinct 32-byte identity sealing key was
   generated on the VPS. Protected files were `root:root 0600`; neither secret
   value was read into the change record. The key's Production binding still
   needs live sign-in proof. Pilot keys and users are not transferred.
3. The owner approved a short transition with the HTTPS target returning 404.
   On 13 October endpoint `we_01M4VBTD55EZZQWYRHARZX79GN` was created in
   WorkOS Production at
   `https://api-prod.orvessian.com/v1/auth/workos-webhook`, subscribed only to
   `session.revoked`. Its signing secret was fetched directly on the VPS into
   a protected file. The private API passed readiness and unsigned webhook
   rejection; the exact public webhook path returns 401 for unsigned POSTs,
   while project, key and general API routes remain 404. A signed delivery, duplicate handling,
   authenticated missed-event replay and session revocation still require a
   live Production account. There are no Production users or sessions yet.
4. Invite a fresh production account on the initial allowlist and complete
   email verification, MFA, sign-in, session renewal, recovery and revocation
   checks. The Production environment currently has no users, so no live
   customer journey has yet passed.

The reviewed [owner sign-in preview edge](../deploy/nginx/orvessian-production-owner-preview.conf)
serves the staged portal while proxying only the WorkOS sign-in, session and
account-session API paths. Project, key and health API paths keep returning
404. The portal itself is public during this preview, but Production admission
is limited to the protected owner email list and project creation remains
closed. The [activation helper](../deploy/governance/activate-production-owner-preview.py)
requires the exact webhook-only edge, healthy Production backup and pilot,
an inactive portal, and exact configuration hashes. It starts the portal,
switches the edge, checks the exposed and denied paths, and restores the
webhook-only edge if any check fails. The unit remains disabled for boot;
the preview is currently active. Opening it does not constitute customer or
project admission.

On 17 October the candidate Nginx configuration passed an isolated syntax
check and the read-only activation preflight passed. The first activation
attempt stopped at the private portal readiness check and restored the
webhook-only edge. Independent checks confirmed the portal inactive and
disabled and `prod.orvessian.com/workspace` still returning 404. A later
private start returned HTTP 200 after the application had time to initialize.
The helper now waits up to five seconds for that private response. After the
bounded readiness fix, the read-only preflight passed and the preview activated.
Public checks returned 200 for the workspace and AuthKit status, and 404 for
project, key and health APIs. WorkOS Production user count is zero, with no
pending invite for the allowlisted owner email. The journal-free health checker
now accepts only the exact webhook-only configuration with the portal off or
the exact owner-preview configuration with the portal active and route checks
passing. The scheduled backup runner now pauses and restarts the preview around
its database snapshot. Its read-only preflight passed; no extra backup was run.
The regular Production backup health check is green with `portal_mode` set to
`owner-preview`.

The callback, origin, logout, signing secret and restricted webhook route are
configured. Step 4 is not accepted until the portal, signed delivery and live
account checks pass.
