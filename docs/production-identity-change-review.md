# Production identity change review — 11 October 2026

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
API hostname is reserved as `api-prod.orvessian.com`; its DNS and service
have not been created.

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

1. Provision isolated production users, services, directories, ports, DNS and
   HTTPS routes on the existing Contabo VPS. The `prod` API startup and
   database migrations are part of the later runtime gate; the current hosted
   pilot launcher is test-only. Check shared-host capacity and rollback before
   enabling customer traffic. A dedicated production VM is a later migration.
   The private production API launcher validates the exclusive managed database,
   restricted API role, verified TLS, production WorkOS binding and loopback port;
   its read-only preflight must pass after schema and grants are installed.
2. Create a new WorkOS Production API key and install it on the production
   host through the hidden-prompt `configure-production-workos-key.py` installer.
   It writes a root-only environment file for the disabled production API unit
   and does not activate a service. Generate a distinct 32-byte identity sealing
   key there. Do not copy the pilot WorkOS key, seal key, or user records.
   The owner created and entered the WorkOS Production key at that prompt.
   File metadata showed `root:root 0600`, and the production API unit remained
   disabled and inactive. A distinct 32-byte identity sealing key was then
   generated on the VPS into the separate root-only production API environment
   file. Neither secret value was read into the change record; the WorkOS key's
   Production environment binding still needs live sign-in proof.
3. When `https://api-prod.orvessian.com/v1/auth/workos-webhook` is live and
   rejects unsigned requests, create a WorkOS Production webhook endpoint
   subscribed only to `session.revoked`. Install its signing secret in the
   protected production runtime configuration. Verify a signed delivery,
   duplicate handling and an authenticated missed-event replay.
4. Invite a fresh production account on the initial allowlist and complete
   email verification, MFA, sign-in, session renewal, recovery and revocation
   checks. The Production environment currently has no users, so no live
   customer journey has yet passed.

The callback, origin, and logout settings are configured, but Step 4 is not
accepted until the pending host, secrets, webhook and live account checks pass.
