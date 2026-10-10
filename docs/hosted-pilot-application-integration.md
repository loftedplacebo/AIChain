# Hosted pilot application integration

## Hosted evidence worker and anchor — 4 October 2026

The accepted synthetic record `synthetic-first-d99e15cf63551a783a85b989229c99e9`
was checked through the restricted API role in the managed `governance_test`
database. It is present in environment `test`. A **separate** hosted worker source and systemd unit are installed
at `/opt/aichain/governance-pilot-worker` and
`aichain-governance-pilot-evidence-worker.service`; the unit is active and
enabled at boot.
The older `aichain-governance-worker.service` continues to serve the unrelated
SQLite demonstration. The hosted worker uses its own OS account, journal and
recording/relayer keys. The protected configuration step requests the existing
`governance_evidence_worker` password at a hidden SSH prompt and runs a paused
one-shot preflight. That preflight passed with publisher
`0xef8E003AbaA6e0f7D05297E28E669758ae79bDBd` and returned `paused`.
The recording-service address is
`0x02B38234B2875f72835193241ecF56FB83098934`. A restricted API-role
read confirmed exactly one pending record in this project before preparation:
the synthetic event above. The owner's separate 1Password escrow copies of
both hosted worker private keys matched the protected VPS files at hidden
prompts. The new relayer was funded with Base Sepolia test ETH. A one-shot
worker tick prepared one signed receipt and Merkle batch. A separate local
verifier confirmed the recording signature, exact event commitment and batch
membership before broadcast, correctly returning `incomplete` while no
transaction existed.

The guarded one-shot worker broadcast submitted batch
`0x974b165f5298b37177e2972349a7553e0ad5a55502036501fa729dd7f930d88a`
as [Base Sepolia transaction](https://sepolia.basescan.org/tx/0x942271d212d47d33c12b13a71c28231441ee19787c38f40af420e41ded721c25)
`0x942271d212d47d33c12b13a71c28231441ee19787c38f40af420e41ded721c25`.
The export was copied off the VPS and verified by the repository's independent
CLI against public Base Sepolia RPC: `exportVerification: verified`, exit 0,
signature valid, trusted signer true, record commitment and membership true,
contract code matched, and 19 confirmations at 19:31 UTC on 4 October. This
checks integrity and canonical testnet inclusion at that time; it does not
authenticate the customer's original source or promise Ethereum finality.
The worker journal records one confirmed transaction and one broadcast
attempt. After the final backup, the guarded activation enabled the separate
worker; its first live ticks returned `idle`.

The scheduled encrypted backup runner now stops the hosted worker when active
and includes its environment-bound SQLite transaction journal. Backup ID
`1ed20255-9c74-4f1b-a4a1-197a3bc92618` uploaded to B2, and a separately
prompted B2 download restored it into a new closed database
`gov_restore_b2_c8073805c276`. The authenticated local archive inspection
reported `journalRoles: ["worker"]`. Backups also completed after receipt
preparation (`429400b9-8c7b-4c3c-8eb9-f067d9d56756`) and after the worker
journal reached confirmed state (`19eb1388-7f3e-4c9b-89b3-cef8f87814ed`).
Those two later sets were uploaded but not individually restored; the earlier
set with the same worker journal was downloaded and restored closed. The
pilot backup health check now requires the hosted worker, portal, API and
timer to be active; it returned healthy after activation. A further scheduled
backup run with the hosted worker active paused and restarted all pilot writer
services, uploaded backup `0d9f77fc-f76e-4133-879a-273434988320`, and left
the worker active with the health check passing. This latest set was uploaded
but not separately restored. The same-cluster
restore is separate from a lost-cluster recovery drill.

Updated 4 October 2026. This records the isolated synthetic `test` deployment on
the existing Contabo VPS. The portal and API are publicly reachable for the
single admitted operator email. Partner admission remains closed until the
full hosted acceptance gate in the partner brief passes. Operator sign-in,
backup, same-cluster restore, hosted evidence export and independent Base
Sepolia verification have passed. The non-operator journey and key revocation
checks remain open.

### Bounded periodic Base Sepolia health watcher — 6 October 2026

The isolated `orvessian-base-health-watcher.service` is running as
`orvessian-chain-watch`, using the write-only `Synthetic Validation` project
key and the existing OpenAI API key. It reads the Base Sepolia chain ID, latest
block and pinned anchor-contract presence, asks `gpt-4.1-mini` for a bounded
`healthy`/`degraded` label, then submits only that label and run metadata through
the Orvessian Python SDK. It holds no receipt or relayer key. The existing
hosted evidence worker remains responsible for signing and anchoring.

This run is capped at one check per hour, 48 model calls, and a hard 48-hour
window ending `2026-10-08T18:18:09Z`. It does not catch up missed runs. The
first check returned `healthy` at Base block `47771201`; event
`watch-98d9051c-c15f-4b4d-a72d-937bc626bb9b` is confirmed in transaction
`0xc5f3665cdd69817dd475ae19a1fb359984950d7217742703d086daa8255b0430`, with a
valid trusted signature, record commitment and batch membership at the
`12`-confirmation pilot threshold. OpenAI model charges are estimated below
`$0.02` for the full window using a conservative 1,000-input/8-output-token
allowance per run. Testnet broadcasting remains subject to the worker's
existing rolling transaction and reservation caps. This is an operator demo,
not a partner trial or a mainnet service.

## Public request and approval journey

The marketing home page should offer **Explore demo** beside **Sign in / Request
access**. The latter leads to the signed-out portal at
`https://portal.orvessian.com/workspace`. Existing admitted users choose
**Sign in to workspace**. New visitors choose **Request pilot access** and
enter an email in the WorkOS AuthKit waitlist. A waitlist request is not an
account or a workspace, and it does not bypass required authenticator MFA.
WorkOS sends a request receipt; approval in its staging dashboard sends an
invitation to finish account creation. Sign-out returns to the portal's
signed-out page, which links back to the marketing site and synthetic demo.

WorkOS waitlist approval and the API's
`WORKOS_PILOT_ALLOWED_EMAILS` admission rule are two separate gates. For each
approved applicant, the operator must review the request in WorkOS
**Users → Waitlist**, run
`ssh root@62.171.161.32 python3 /opt/aichain/governance-pilot-db-setup/admit-pilot-waitlist-email.py applicant@example.com`
with the reviewed email in place of the example, confirm the script reports
the API active, then approve the entry in WorkOS
so the invitation arrives. Do not disable the admission list or replace it
with a domain wildcard. Denied or pending entries receive no workspace access.
This is a manual pilot procedure; approval is not yet synchronized between
WorkOS and the API. The applicant can create their own pilot workspace only
after completing the invitation and MFA. A public request form therefore does
not mean general production availability.

### Second-account admission drill — 5 October 2026

An owner-controlled Gmail address, separate from the operator account,
submitted the public **Request pilot access** form. AuthKit displayed its
waitlist receipt. A read-only WorkOS API query found exactly one matching
`pending` entry; the hosted API admission list did not yet contain that
address. The exact address was then added with the root-only admission helper,
and the API service returned active. WorkOS returned HTTP 200 and state
`denied` for that pending entry. The documented approval reversal then
returned HTTP 200 and state `approved`; the exact email remained on the API
admission list. Separate read-only queries found one invitation in `accepted`
state, one verified WorkOS user, a sign-in timestamp and one enrolled `totp`
factor. The owner confirmed that this second account successfully signed in
to the Orvessian workspace. This drill verifies the request, separate API
gate, deny and approve transitions, invitation acceptance, identity-side MFA
enrollment and portal access. It does not yet prove post-authentication access
denial for a different person.

For a live admission-gate denial check, the owner agreed to briefly remove
only this second test email from `WORKOS_PILOT_ALLOWED_EMAILS`. A five-minute
automatic restore was scheduled before removal. The API restarted active
while the operator address remained admitted. The owner authenticated with
the second account and its MFA, but the workspace would not sign it in. The
exact address was immediately restored with the admission helper, the API
returned active, and an idempotent repeat confirmed it remained admitted.
The fallback restore timer was cancelled. The owner then completed a fresh
sign-in and confirmed that the workspace opened again. This demonstrates a live block
for a previously approved account when the API gate denies it; the initial
denied-waitlist state was verified separately by the WorkOS API.

There is no Orvessian platform-operator approval UI yet. Workspace Settings
manages a customer's own workspace and is not the pilot admission queue.
The current operator procedure is WorkOS **Users → Waitlist** plus the
exact-email API admission helper. A later Orvessian Admin section should use
the same MFA sign-in with a distinct platform-operator role, server-enforced
authorization and an audit log. Its approval action should update the API
admission gate before calling the WorkOS waitlist approval endpoint and
surface partial failures for recovery. Denial and revocation need separate
actions and tests; deleting a waitlist entry alone does not revoke an
already-sent invitation.

On 4 October 2026, the operator selected public requests with approval before
portal access. In the `Orvessian Pilot Test` **Staging** environment, WorkOS
**Authentication → Features → Waitlist** was enabled. The dashboard then showed
**Waitlist: Enabled**, **Sign-up** superseded, and **Multi-factor auth: Required**.
Its preview displayed **Join the waitlist for Orvessian** with an email field.
No test applicant email was submitted.

The portal's signed-out page was built in the isolated
`C:/AIChain/website-portal-signup` checkout with `npm run typecheck` and
`ORVESSIAN_NODE_BUILD=1 npm run build`. The 47,030,933-byte standalone archive
matched SHA-256
`C72450D1B39112F1A8BEC63E3E71C5625262BC602A9807B7E110313C62A02C11`
locally and on the VPS. The staged build replaced the active portal with a
rollback copy at
`/opt/aichain/orvessian-pilot-portal-prev-waitlist-20261004`; the service and
HTTPS `/workspace` and `/api/auth/status` health checks passed after startup.
The live portal showed separate **Sign in to workspace** and **Request pilot
access** buttons. Clicking the latter opened the WorkOS waitlist form; clicking
the former opened the existing-user sign-in form.
The root-only admission helper was syntax checked on the VPS and its add,
duplicate, and missing-setting paths passed a synthetic no-change check. No
new applicant was admitted during this rollout.

The public marketing Site was first published as version **28** from isolated
commit `b39c90623a25b6ec3a857be5516273bce779d22e`, then version **29**
from `e34d1dfc9bec8cd91f518fc644427188af9cecb5` corrected the demo's
customer sign-in link to the hosted portal. On the custom domain,
**Sign in / Request access** appeared beside **Explore the governance demo**;
the first opened `https://portal.orvessian.com/workspace`, and the demo still
opened `https://orvessian.com/portal`. The demo's **Customer sign-in** link
now also leads to the hosted portal. The website continues to label the
experience a synthetic demo and private testnet pilot.

## Staged application

- The managed PostgreSQL cluster, migrations, grants and strict runtime role
  checks are recorded in [the cluster setup](digitalocean-pilot-cluster-setup.md).
- Created a separate WorkOS project, `Orvessian Pilot Test`, with a free
  staging environment (`environment_01M41525TKN2W2APQPPETM1AZ3`). Renamed its
  default application to `Orvessian Pilot Portal` and recorded client ID
  `client_01M415264WYTWS294EMP8CNJNT` in the ignored provider inventory.
  WorkOS shows `https://portal.orvessian.com/api/auth/callback` as its saved
  redirect URI. AuthKit MFA is set to **Required**, public self sign-up is
  disabled, and user impersonation remains disabled. These are dashboard
  settings. The operator completed browser sign-in on 4 October 2026, and a
  read-only WorkOS API check returned a recorded sign-in and one TOTP factor.
  The staging API key was entered through the VPS hidden prompt and is in the
  protected API runtime file, not in Git or this document.
- Sent the owner-approved WorkOS invitation to `mjgrant@live.co.uk` on
  3 October 2026. The dashboard later showed the invitation as **Accepted** and
  the user's email as verified. The subsequent hosted browser sign-in succeeded
  and created an app session. No password or one-time code was handled here.
- WorkOS initially had Enterprise SSO enabled by default. Its MFA setting says
  it does not apply to SSO users. Automatic approval review rejected the first
  attempt to save a change without specific owner authorization, so that
  dialog was cancelled. The owner then explicitly authorized disabling pilot
  SSO, and the dashboard verified **Enterprise SSO: Disabled**. Email/password
  remains enabled; magic-code and passkey methods remain disabled.
- Registered the owner-approved webhook endpoint
  `https://api.orvessian.com/v1/auth/workos-webhook` (ID
  `we_01M415QBKF79K7VZCRQ9C5TMVY`) for the sole event `session.revoked`.
  WorkOS shows it as enabled. The signing secret was entered through the VPS
  hidden prompt. A dashboard resend was delivered with HTTP 200 after the
  public API route and payload compatibility fix were deployed.
- Built the website with `ORVESSIAN_NODE_BUILD=1 npm run build`. Vinext generated
  a standalone Node server. Installed that output under
  `/opt/aichain/orvessian-pilot-portal` with its own
  `orvessian-pilot-portal` OS account and
  `orvessian-pilot-portal.service`. The service uses
  `WORKSPACE_ORIGIN=https://portal.orvessian.com`,
  `GOVERNANCE_API_URL=https://api.orvessian.com`, and binds to
  `127.0.0.1:3002`. `VINEXT_TRUSTED_HOSTS=portal.orvessian.com` permits the
  framework to honor Nginx's HTTPS forwarding. It is running and enabled for
  automatic startup.
- Staged a separate copy of the governance API source and dependencies under
  `/opt/aichain/governance-pilot-api`. Installed the dedicated
  `aichain-governance-api` OS account and
  `aichain-governance-synthetic-api.service`, with an isolated working directory.
  The API is running on `127.0.0.1:8796` and enabled for automatic startup.
  Its root-owned runtime file is `/etc/aichain-governance-synthetic-api.env`
  with mode `600`; systemd loads it before switching to the restricted account.
  The running SQLite demo API and evidence worker were not changed; both were
  active after staging.
- The pilot portal/API certificate and [exact-host Nginx proxy](../deploy/nginx/orvessian-pilot-app.conf)
  for portal and API, including rate limits, loopback upstreams and the ACME
  challenge, are active. The previous 404 holding site remains available for
  rollback. `nginx -t` passed before and after the site switch.

## Checks completed

- The standalone portal build finished successfully on Windows.
- The portal process listens on `127.0.0.1:3002`; a VPS-local request to
  `/workspace` returned HTTP 200.
- The protected runtime installation initially failed preflight because the
  application required a 32-character WorkOS webhook secret. The dashboard's
  signing secret was shorter; after aligning the application's accepted range
  to 24–512 characters, configuration and restricted PostgreSQL preflight
  both passed. The protected value was never printed to logs or documentation.
- The public portal `/workspace` and `/api/auth/status` return HTTP 200;
  `/api/auth/start` returns the expected 303 redirect. Anonymous workspace and
  API session requests return HTTP 401. The public API `/health` stays hidden
  behind HTTP 404, and an unsigned webhook returns HTTP 401.
- A signed synthetic webhook for a nonexistent random session returned HTTP
  200 and `applied` through the public HTTPS route. WorkOS's first dashboard
  resend reached the API but returned HTTP 400 because its signed test payload
  omitted `context.client_id`. The handler now accepts absent context from a
  correctly signed endpoint event and rejects an explicitly different client
  ID. The next dashboard delivery showed **Delivered**, HTTP 200 and
  `duplicate`, confirming an earlier queued retry was already accepted.
- Both pilot services are active and enabled for automatic startup; Nginx is
  active and its configuration passes `nginx -t`.
- Updated the hosted portal's signed-out copy to describe invitation-only
  access and removed its unused create-account link. `npm run typecheck` and
  `ORVESSIAN_NODE_BUILD=1 npm run build` passed. The new standalone build was
  staged in a separate VPS directory, switched into place with a rollback path,
  and the service plus public `/workspace` and `/api/auth/status` checks passed.
- On 2026-10-04, fixed signed-out navigation: the brand now opens the public
  `https://orvessian.com/` site, and the sign-in and synthetic-demo links have
  visible, keyboard-focusable button styling. The previous CSS only styled
  `button.gp-primary`, leaving the sign-in `<a>` as plain text. `npm run
  typecheck` and a standalone Vinext build passed. The uploaded archive SHA-256
  matched locally and on the VPS; the service was switched with the former build
  retained at `/opt/aichain/orvessian-pilot-portal-prev-20261004T085016Z`.
  The service remained active, and public `/workspace`, `/portal`, and the
  marketing destination each returned HTTP 200. The first immediate loopback
  check raced service startup; the subsequent service and public checks passed.
- The operator created the synthetic workspace `Orvessian Pilot Test`
  (`org-831aa048-b268-4fce-98f3-455429034ef8`) and first project
  `Synthetic Validation` (`prj-d9109260-1232-4561-ab4a-ab2e5c8f658f`) in
  the hosted portal. The owner role and active app session were visible.
- With specific owner approval, created a write-scoped one-day key labeled
  `Hosted synthetic smoke test` (key ID
  `key-58e1de83-592d-4d7c-bbaa-815c2dd286fc`), expiring at
  `2026-10-05T08:29:32.248Z`. The owner reported saving its one-time secret
  as a separate 1Password item. The secret is absent from Git and docs.
- Prepared [the hidden-prompt synthetic submission script](../deploy/governance/submit-hosted-synthetic-event.py)
  on the VPS with mode `700`; `python3 -m py_compile` passed.
  The first hidden input failed local key-format validation before any network
  request. The script now trims paste whitespace and distinguishes the project's
  `ovk_` secret from the `key-` identifier or WorkOS `sk_` credential. The
  corrected script passed `python3 -m py_compile` on the VPS.
- The owner confirmed the saved value had no `ovk_` prefix, and the portal
  showed the first key had never authenticated. After fresh WorkOS
  reauthentication and specific owner approval, rotated that one-day key with
  no old-key overlap. The replacement is write-scoped, active, and expires
  `2026-10-05T08:49:54.343Z`; its non-secret key ID is
  `key-cbd2e40b-4abe-4a75-aef5-103bc67ed29b`. The owner reported saving
  the new one-time `ovk_` secret in 1Password. The secret is absent from Git
  and this document. The hidden-prompt script submitted one synthetic record
  through public HTTPS and received HTTP 201. Event ID
  `synthetic-first-d99e15cf63551a783a85b989229c99e9` appeared in the
  hosted portal's Decisions view after Refresh as `ai.run.completed` from
  `synthetic-onboarding-agent`.
- On 4 October, the operator reported completing WorkOS password reset, then
  signing back in with the new password and a TOTP code and opening `Synthetic
  Validation`. The operator also reported testing restoration of the AuthKit
  authenticator entry on another device or from a protected backup, and having
  a separately secured 1Password recovery method. These are owner-reported
  recovery checks; no MFA factor was removed or reset in the live environment.
- The owner showed separate 1Password item titles for the pilot WorkOS API key,
  webhook signing secret, operator AuthKit login, synthetic test key and pilot
  identity sealing key. Only those non-secret titles were added to the ignored
  `C:/AIChain/.env.providers` inventory. The owner reported saving the sealing
  key; its value and the other item contents were not read or copied into Git.
  A root-only, hidden-prompt comparison on the VPS reported **MATCH** for the
  WorkOS API key, webhook signing secret and identity sealing key against the
  protected runtime file. The checker prints no secret values and passed
  `python3 -m py_compile`; the protected runtime file remains mode `600` and
  the checker is mode `700`.
- A subsequent sign-out in Edge reached WorkOS's
  `app-homepage-url-not-found` error page. The pilot AuthKit application had
  neither an app homepage nor a logout URI. Set its app homepage and default
  logout URI to `https://portal.orvessian.com/workspace` through the WorkOS
  control plane; a fresh read-back confirmed both values and left the existing
  sign-in callback URI unchanged. The owner subsequently confirmed that the
  fresh sign-out flow returned to the workspace sign-in page successfully.
- Eight focused portal gateway tests passed. Both existing SQLite demo services
  stayed active.
- The initial copied VPS dependency set lacked `jose`, which verifies WorkOS
  access tokens. Added the repository-pinned `jose` 6.2.12 package to the
  isolated API bundle and corrected the installer to merge the existing VPS
  packages without skipping the new package. A dependency-load check under
  `aichain-governance-api` returned `runtime_deps_ok` for `pg` and `jose`.

## Completed backup setup and validation — 4 October 2026

1. Finish independent encrypted Backblaze B2 backup verification and a fresh
   target restore before admitting a design partner. On 4 October, the owner
   created and signed into a B2 EU Central account. The private
   `orvessian-pilot-test-backups` bucket is in `eu-central-003`, with
   Backblaze-managed server-side encryption, a rule to hide objects after 14
   days and delete hidden versions after at least one more day. Object Lock is
   disabled. Separate bucket/prefix-scoped upload and read-only restore key IDs
   and secrets were saved by the owner in 1Password. Backblaze's UI labels the
   upload key `Write Only`, although its issued capability list also includes
   `deleteFiles` and some bucket-setting permissions; the actual scope is the
   bucket and `orvessian-pilot/test/` prefix. A separate root-only 32-byte
   archive key was generated on the VPS and its 1Password escrow copy matched
   through a hidden prompt. The upload key was installed root-only on the VPS.
   The first coordinated capture attempt failed safely before an archive was
   created because the script included the separate legacy `acceptance`
   worker's SQLite `config/jobs` journal as a governance journal. That file
   has no governance environment marker and is outside the hosted synthetic
   API's PostgreSQL state. At that checkpoint, the capture script stopped only
   the pilot portal and synthetic API and backed up `governance_test`; there
   was no hosted worker journal. The 4 October worker staging later added the
   separate hosted worker to the pause list and its journal to the encrypted
   capture when that journal exists. A rerun completed the encrypted
   PostgreSQL capture and B2 upload. Backup ID
   `be147819-f1cd-4a8e-8e85-0ae6736ef5a9` has an upload completion marker
   in the private bucket; the VPS completion pointer is root-only, and portal
   and synthetic API services restarted and are active. The owner then ran the
   restore helper with the separately escrowed read-only B2 key. It discovered
   the set, downloaded and authenticated its archive, and restored it into
   `gov_restore_b2_675760d159ba`. Recovery review passed with access revoked
   and closed. The owner approved storing a separate root-only `doadmin`
   credential on the VPS for unattended backups. The installer verified it
   against DigitalOcean before writing `/etc/aichain/pilot-backup/database-password`
   with mode 600. The `orvessian-pilot-backup.timer` is enabled for 03:00 UTC
   daily with missed-run catch-up. A direct scheduled-mode run and a systemd
   service run both completed encrypted B2 uploads without operator prompts.
   The successful systemd run produced backup ID
   `f0fabc1b-96e3-4532-a44d-7448ac80fb7a`; portal and API were active
   afterward. The initial systemd run failed during capture with `PrivateTmp`
   enabled; removing that sandbox option fixed it. The backup service still
   uses `NoNewPrivileges`, `ProtectHome`, and a root-only umask. A read-only
   VPS health check now verifies a completed upload within four hours of the
   daily check, the enabled and active timer, the last service result, and the
   portal/API service state; after hosted evidence activation it also requires
   the separate hosted worker service to be active. The active Codex heartbeat `Orvessian pilot backup
   failure alert` runs at 05:30 Europe/London each day and notifies this chat
   only on failure or inability to check. On 4 October the owner completed a
   timed restore drill against the latest scheduled backup
   `f0fabc1b-96e3-4532-a44d-7448ac80fb7a`: B2 discovery 0.28 seconds,
   download and authentication 1.12 seconds, fresh database restore and review
   6.85 seconds, 8.25 seconds total. The new target
   `gov_restore_b2_e60fcb48a34d` remained revoked and closed. This tests the
   backup data path in the existing DigitalOcean cluster; it does not include
   replacing a lost cluster, changing application configuration, or activating
   a restored service. A post-drill health check found the backup timer,
   portal and API active, the last backup service successful, and the upload
   marker fresh. The active `Orvessian monthly backup restore drill` Codex
   heartbeat checks the dated record on the fourth day of each month and
   reminds the owner when another manual drill is due; it does not run a
   restore or access credentials.

### Pilot backup operations

The timer runs at 03:00 UTC daily and catches a missed run after the VPS
returns. Check `systemctl list-timers orvessian-pilot-backup.timer` and
`systemctl status orvessian-pilot-backup.service` on the VPS. A successful
service log includes `B2 encrypted upload completed` and a new backup ID;
the portal and synthetic API must be active afterward. The backup database
credential is in `/etc/aichain/pilot-backup/database-password` (root-only),
the B2 upload credential and archive key are separate root-only files in that
directory, and the B2 restore credential stays in 1Password. For a monthly
restore drill, run `verify-pilot-b2-restore.py` with the restore key and
`doadmin` password at hidden prompts; it creates a new closed database and
does not activate a service. It prints discovery, download/authentication,
restore/review and total elapsed seconds. Review old drill databases and their retention
separately before deletion. An uploaded set alone does not prove the recovery
time target. The daily Codex health check supplies failure notification in
this chat; it does not inspect B2 object contents or prove recovery readiness.

On 7 October 2026, the laptop resumed the daily Codex check late and its old
four-hour age rule alerted even though the VPS timer had run at 03:00 UTC and
completed the B2 upload at 03:00:39 UTC. The VPS service result was successful,
and the timer, portal, API and both registered workers were active. The
read-only checker now requires a valid version-2 completion marker newer than
the latest due 03:00 UTC daily window; the new window becomes due at 04:00 UTC.
It reports marker validity, exact completion time, due-window start and
coverage. A delayed chat check therefore recognizes a completed daily backup,
while a missed window or invalid marker remains unhealthy. Six local
registry/backup checks passed and the deployed VPS checker returned healthy
with the same 03:00:39 UTC completion marker. The Codex backup heartbeat was
updated to use these fields; it remains a daily owner chat alert.

The API preflight verified database configuration and the restricted role.
Public route, signed webhook and anonymous-access checks were completed
separately. Encrypted B2 upload and a closed fresh-database restore have passed.

## Outstanding before a partner API test or evidence trial

The [provisional partner checklist](examples/first-design-partner-synthetic-pilot-proposal.md#provisional-partner-onboarding-checklist)
allows a short, supervised ingestion-only test in a separate partner project
after its scope and isolation are checked. Signed evidence may remain pending
in that first test. The complete evidence trial additionally needs that
project's worker, journal backup/restore and backlog monitoring.

- Hosted project-key revocation passed on 5 October: a disposable one-day
  write key accepted one synthetic record (HTTP 201), was revoked in the portal
  after fresh operator reauthentication, appeared as revoked in key history,
  and the same secret was rejected for a fresh submission (HTTP 401). The
  probe record ID was `pilot-revocation-a7da194372b81d83695e4430f394d6cd`.
  The second-account request,
  exact-email admission, denial and WorkOS approval transitions passed. The
  accepted invitation, TOTP enrollment, sign-in and owner-confirmed workspace
  access also passed. The temporary API-gate removal blocked fresh workspace
  sign-in after provider authentication; a fresh sign-in after restoring
  admission passed. This pilot journey is complete. A separate never-approved
  identity can be used later to extend the denial coverage.
- Basic hosted resource, Synthetic Validation evidence-backlog and WorkOS
  revocation-replay coverage checks are active under Michael Grant as the
  named support/incident owner. A 30-minute failure-only heartbeat checks the
  combined read-only VPS report; a separate daily heartbeat covers encrypted
  B2 backup. The one-minute revocation replay timer advanced from the selected
  4 October baseline and the status probe reported `observed-fresh`. The API
  emergency pause/resume rehearsal passed. See the
  [support runbook](pilot-support-and-incident-runbook.md). Extend worker and
  alert coverage to each separate partner project before its evidence trial.
- Complete a per-partner synthetic-data brief with agreed fields, contacts,
  dates, success measures, support response and pause/exit procedure. An
  [internal proposal](examples/first-design-partner-synthetic-pilot-proposal.md)
  is ready for review. Review
  the now-current public status page and complete the unpublished privacy/terms drafts before promoting the waitlist.

The 8.25-second drill restored within the existing DigitalOcean cluster and
left the target closed. It did not rebuild a lost cluster, repoint the API, or
activate restored access; the 24-hour RTO remains a target.

