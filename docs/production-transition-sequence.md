# Production transition sequence — 11 October 2026

This is the next execution plan. The existing Contabo/DigitalOcean/B2 pilot
remains a synthetic `test` service with four of five project slots in use. It
does not become production by changing a hostname or WorkOS client ID.

The [11 October shared-cluster change review](production-shared-cluster-change-review.md)
records the earlier proposal and baseline. The owner has selected the
[Contabo test / DigitalOcean production cutover](production-architecture-cutover-note.md)
instead. Do not apply the shared-cluster proposal as written.
The current [exclusive-cluster change review](production-exclusive-cluster-change-review.md)
records the accelerated backup checkpoint, retirement of six pilot databases
and three pilot roles, and the verified empty production-only bootstrap.

## Selected shape

- **Local development:** private loopback PostgreSQL, API and portal with
  WorkOS Staging. Use short-lived isolated HTTPS previews only for callbacks,
  webhooks or deployment behavior that cannot be checked locally.
- **Pilot:** keep the hosted synthetic portal, API and workers on Contabo and
  move their complete `governance_test` database to PostgreSQL on that VPS.
  Keep the managed pilot database as rollback until local service, backup and
  closed-restore acceptance pass. Keep the five-project cap until measured.
- **Production:** repurpose the existing London DigitalOcean managed PostgreSQL
  cluster exclusively for production after the pilot cutover. Initially run
  isolated production application services on the existing Contabo VPS. Use non-owner production
  API, worker and migration roles, the separate WorkOS Production environment,
  and separate secrets,
  signing/relayer keys, worker journals, and independent encrypted backups.
  Start with WorkOS hosted sign-in. Keep production traffic closed until all
  release checks pass.
- **Availability later:** the reused managed cluster is single-node at launch,
  and the initial application host is shared with the synthetic pilot. Reassess
  a dedicated production VM and a database standby as users, measured capacity
  and an availability target justify their cost. Independent backups and
  replacement-cluster recovery remain required.
- **Evidence chain:** undecided. Do not copy the Base Sepolia contract, chain
  setting, pilot wallet or test receipts into a production approval record.
  Production receipt acceptance remains blocked until chain, contract,
  custody, gas and verification are selected and tested.

The [version-6 non-secret deployment plan](../deploy/governance/deployment-plan.example.json)
and its validator must be checked against the selected Contabo test database
and exclusive DigitalOcean production cluster before production release.
A valid result is still `releaseReady:false`:
provider account ownership, actual resource IDs, permissions and restore
evidence need independent verification.

Read-only WorkOS account inspection on 10 October found a Production environment
in the original Orvessian project, separate from the pilot project's Staging
environment. The owner added billing information on 11 October and the workspace
now reports `productionState: Active`. The hosted production application has
password sign-in, required authenticator-app MFA and breached-password checks;
public sign-up remains closed. A separate Production API key is now stored
root-only on the VPS; no production customer account has been created. The
current $0 invoice estimate is not a
spending cap; see the [change review](production-shared-cluster-change-review.md)
for optional WorkOS meters and remaining configuration.

## Execution order

| Gate | Work | Completion evidence |
| --- | --- | --- |
| 1. Local development | Recheck the existing private PostgreSQL cluster, loopback API and WorkOS Staging configuration; run sign-in and one synthetic local customer journey. | No pilot or production credentials in local data; API readiness, scoped keys and session tests pass. |
| 2. Pilot database cutover | Install local PostgreSQL on Contabo, migrate the complete pilot database under a writer pause, repoint services and health checks, then verify backup and closed restore. Keep the managed copy as rollback until acceptance. | Receipts, projects, key revocations, worker journals, B2 backup, closed restore and health all pass. |
| 3. Production cluster preparation | The reviewed on-demand coordinated B2 backup and independent closed restore passed. Six named managed pilot/restore databases and three pilot roles were retired. The `governance_prod` database and restricted roles were created and verified. The admin credential was rotated. Restrict trusted sources when the production app endpoint exists. | No pilot object remains on the managed cluster; production bootstrap and admin rotation passed. Network restriction remains open. |
| 4. Production identity | Configure WorkOS Production hosted AuthKit, MFA, exact HTTPS callbacks and signed webhook; create new production API key and sealing key in protected storage. | Fresh production account passes sign-in, MFA, recovery, revocation and webhook replay tests; staging identities are not assumed to transfer. |
| 5. Runtime and backup | Build pinned API, worker and portal artifacts; apply migrations and strict roles in the production database; deploy isolated production users, directories, units and loopback ports on Contabo behind private readiness checks. Configure production-specific encrypted backup, journals, retention and alerts that do not silently reuse the pilot backup set. | Green release gates, hashes, scoped read/write/denial checks in both databases, shared-host fault isolation, current production backup marker and every worker registered. |
| 6. Recovery | Restore when the original managed DB cluster is unavailable, review every journal and access state, then activate an isolated replacement service. | Measured recovery point and time, revoked captured access, receipt proof preservation and successful post-restore customer journey. |
| 7. Public acceptance | Finish abuse, security and privileged-access review; legal pages, support/privacy/security inboxes, real-data terms, capacity and incident rehearsal. Decide and test production evidence chain. | Owner go/no-go record and claims limited to tested capacity and recovery. |

The disabled [production API unit](../deploy/systemd/orvessian-production-api.service)
specifies a distinct Unix identity, release directory, protected environment
file and private loopback service. It is a deployment template only: install
and start it after the production database migrations, restricted login,
WorkOS credentials and private preflight pass. Keep the public route closed
until the end-to-end and recovery gates pass.
The separate [production portal unit](../deploy/systemd/orvessian-production-portal.service)
defines an isolated `orvessian-prod-portal` identity and
loopback port 3003. It binds the exact Production portal/API origins and sets
`WORKSPACE_ENVIRONMENT=prod`, which keeps public sign-up closed. Its non-login
Unix account, root-owned empty release directory and disabled, inactive unit
were staged on Contabo on 14 October. It has not been built or started; a pinned website artifact and
private portal verification remain required before any `prod` customer route
opens. The portal gateway deliberately refuses a public portal origin paired
with a loopback API URL, so its private integration check must retain the
reviewed HTTPS origin/Host boundary without exposing customer routes.
The [portal host staging helper](../deploy/governance/stage-production-portal-host.sh)
checks the exact unit hash and pilot service health, then creates only its
non-login Unix identity, root-owned empty release directory and disabled,
inactive unit on `--apply`. The shell syntax and read-only preflight passed
on the VPS, then `--apply` staged the unit. Independent checks found the unit
disabled/inactive and `prod.orvessian.com` still returning 404; the pilot
health check remained green. This did not deploy a portal artifact, start a
listener or alter Nginx.
The [host staging helper](../deploy/governance/stage-production-api-host.sh)
can create the non-login API identity, empty root-owned release directory and
disabled unit earlier. Its default mode is read-only; `--apply` never starts a
service or creates an HTTPS route. Install a pinned API artifact and complete
the private preflight before enabling the unit.
Build the production API artifact from a pinned Linux checkout using Node 24,
`npm ci --omit=dev --ignore-scripts`, and the shared deterministic packager's
`--component api` option. Record the Git SHA and archive SHA-256. Inspect the
archive for `scripts/governance-production-api.cjs`, the PostgreSQL and WorkOS
dependencies, and absence of secret files. Stage it in the root-owned release
directory while the unit remains disabled. The
[release staging helper](../deploy/governance/stage-production-api-release.py)
checks the pinned archive hash, allowed file types, size and required members;
its default mode is read-only. `--apply` fills the empty production directory
and writes a non-secret release manifest, then confirms the unit is still
disabled and inactive. This initial staging operation does not enable the
public route or replace a live production release.
For later inactive replacements, the
[offline release helper](../deploy/governance/replace-production-api-release.py)
requires the exact current commit, new commit, archive SHA-256 and a disabled,
inactive unit. Its default mode is read-only. `--apply` retains the prior
release under an exact-commit rollback path before switching directories;
`--rollback --apply` reverses that swap while the unit remains off. It does
not restart services or change public routing.
On 11 October its pinned unit hash and read-only preflight passed, then
`--apply` staged `orvessian-prod-api` with `/usr/sbin/nologin`, the empty
root-owned `/opt/aichain/orvessian-production-api` directory, and
`orvessian-production-api.service`. Independent `systemctl show` reported
`UnitFileState=disabled` and `ActiveState=inactive`; the synthetic pilot health
check remained green. No production environment file, database login, public
route or customer traffic was activated at that host staging checkpoint.

The pinned Linux checkout `271c129f752cffd8095e9fbdc7b0339d3390f0d8`
installed lockfile dependencies with npm install scripts disabled. Its API
archive SHA-256 is
`c266034f172a43e41b84ea405281a31193a6d0d9799fbbbff25968a601e00055`.
The archive contains the production entry point and required runtime packages,
and no secret-named files. The read-only release preflight accepted 5,877
members before the archive was staged in the root-owned production release
directory. The release manifest records both hashes; the production unit
remained disabled and inactive, port 8791 stayed closed, and the synthetic
pilot health check remained green. The targeted Linux API and WorkOS tests
passed 38/38; two website gateway tests require the separate website checkout
and were covered in the earlier local full suite. This staged artifact is
private preparation, not production runtime or customer acceptance.

On 10 October, the existing isolated local `dev` PostgreSQL cluster started,
the loopback API returned HTTP 200 for `/health` and `/ready` and HTTP 401 for
an anonymous `/v1/session`, then both processes were stopped. This is a
readiness check for Gate 1, not the full browser, MFA or receipt journey.

On 11 October, the WorkOS Production AuthKit callback, logout return, web
origin, homepage and initiate-login URL were configured for the temporary
`prod.orvessian.com` preparation hostname. MFA remains required and public
sign-up closed. The [production identity change review](production-identity-change-review.md)
records the application-side closed-admission guard and the remaining live
host, credentials, webhook and account acceptance work. No production user
exists yet. The revocation-only webhook was registered on 13 October under
the owner's approved short transition. Its signing secret and exact HTTPS
route are now installed; a real signed delivery still needs to be accepted.

Keep the existing portal/API hostnames on the pilot during preparation. Use
separate temporary production hostnames on Contabo and register their exact
WorkOS callbacks. Plan the eventual domain switch and rollback only after the
new services pass end-to-end acceptance. Do not import pilot users, workspaces,
API keys or testnet evidence as live customer records by assumption.
The authoritative DNS is currently at GoDaddy. `prod.orvessian.com` and
`api-prod.orvessian.com` were added on 13 October as A records pointing to
the existing Contabo IPv4 address. Both resolved from the authoritative
GoDaddy nameserver. The [closed Nginx preparation](../deploy/nginx/orvessian-production-preparation.conf)
serves HTTP ACME challenges and returns 404 on every other HTTP or HTTPS
path. A separate Let's Encrypt certificate was issued for both names, expiring
11 January 2027, with automatic renewal registered. Nginx validation passed,
both HTTPS names returned 404 with valid TLS, and pilot health remained green.
This provides host and certificate preparation only: no production API, portal,
customer traffic, HTTPS proxy or WorkOS webhook endpoint is active yet.

## Budget and later VM decision

The initial plan adds **no DigitalOcean application VM**. The existing
2 GiB/1 vCPU managed PostgreSQL Standard single-node cluster costs about
**$30.45/month** already and is now exclusively for production. The local
PostgreSQL 17 test cluster and initial production app services use existing
Contabo VPS capacity. A separate 4 GiB/2 vCPU Basic Droplet remains a later
**$24/month** list-price option. These estimates exclude production backup
storage, transfer, DNS, monitoring, taxes and other services. Measure shared
host and database load before customer traffic. Sources:
[DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets) and
[Managed Databases](https://www.digitalocean.com/pricing/managed-databases).

The existing database is single-node, with 2 GiB RAM, 30 GiB storage and a
displayed 47-connection limit. The pilot no longer shares its database
connections or cluster maintenance. The production app initially shares the
Contabo host's CPU, memory, disk and administrator failure domain with the
pilot. DigitalOcean states that Standard
Edition standby availability changes from 15 October 2026 for new accounts
and 30 November for existing accounts; do not assume a low-cost Standard
high-availability upgrade will remain available. A required availability SLA
would need a fresh design and quote. [DigitalOcean PostgreSQL pricing and
plan notice](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/).

WorkOS says hosted AuthKit is free under its stated 1-million-monthly-active-
user allowance, but Production still requires billing information and its
configuration is separate from Staging. The optional branded custom login
domain is deferred. [WorkOS environment guidance](https://workos.com/docs/authkit/environments)
and [pricing](https://workos.com/pricing).

No new VM was ordered. Before a later VM purchase, prepare exact resource
settings, budget and rollback record. Production traffic, real customer data
and mainnet funding require later, separate go/no-go decisions.

## Database release conditions and standby review

The pilot database was copied and accepted on Contabo on 11 October 2026,
including its worker registry, key revocations, fresh receipt proof, encrypted
off-host backup and independent closed restore. The managed pilot copy remains
the rollback source until the reviewed on-demand B2 backup and independent
closed restore pass. The owner accelerated this checkpoint on 11 October;
the unattended 12 October backup remains a separate operational check. The
six managed pilot databases and three old roles have now been retired under
the exact-object change review, and the empty production database created. Rotate the
managed administrator password before production use and restrict trusted
sources to the production application and reviewed operator access.
After rotating it in DigitalOcean, run the protected
`configure-production-database-admin.py` installer on Contabo at a hidden
terminal prompt. It verifies the new credential against `governance_prod`
over verified TLS and stores it under `/etc/aichain/production`; the managed
inventory then prefers that production credential. Retire the obsolete pilot
operator copy after dependent historical tools have been reviewed.

The reused cluster has `governance_prod` and three restricted production roles.
On 11 October the owner rotated the managed `doadmin` password and installed it
through the protected VPS prompt, and installed a separate WorkOS Production API
key through a second protected prompt. The guarded schema helper then applied
all 19 pinned migrations and the reviewed API and worker grants. Its verification
found the `prod` environment marker, active recovery gate and no `PUBLIC` table
grants; it returned the migration role to `NOLOGIN` with no password. Independent
inventory found zero production database connections and all three roles still
`NOLOGIN`; the production API remained disabled and the synthetic pilot healthy.
The separate production API login was then generated on the VPS with a SCRAM
verifier, and its own database URL and 32-byte identity sealing key were stored
in `/etc/orvessian-production-api.env` as `root:root 0600`. The API role passed
the runtime profile's exact grant and denial check. Only that API role has
`LOGIN`; migration and worker roles remain `NOLOGIN`. The API unit is still
disabled and inactive, and its environment file is deliberately incomplete
until signed WorkOS webhooks and closed admission are configured. The worker
login and scheduled production backup remain open. Never put `doadmin` in a service.
On 13 October the [guarded runtime installer](../deploy/governance/configure-production-api-runtime.py)
added the reviewed `prod` PostgreSQL profile, Production client/callback,
closed owner-only admission list and loopback port to that root-only environment
file. The installer required an exact three-field base file and an inactive,
disabled unit; its focused tests passed. Post-install inspection found
`root:root 0600`, the expected variable names, an inactive/disabled production
unit, and healthy pilot coverage. At that checkpoint the WorkOS signing
secret was absent and service activation remained gated.
The separate [hidden-prompt webhook installer](../deploy/governance/configure-production-workos-webhook.py)
remains staged but was not used. After the owner approved a brief 404 delivery
window, WorkOS Production endpoint `we_01M4VBTD55EZZQWYRHARZX79GN` was
registered for `session.revoked` at
`https://api-prod.orvessian.com/v1/auth/workos-webhook`. The public route
initially remained 404 while the signing secret and edge were prepared;
there were no Production users or sessions. An alternate guarded
[API installer](../deploy/governance/install-production-workos-webhook-from-api.py)
can fetch that exact endpoint's secret using the existing protected Production
API key directly on the VPS and install it without printing or copying it to
the operator laptop. It requires an inactive, disabled Production API unit,
root-only key file, exact endpoint URL and event scope, and a usable signing
secret. Its local tests passed. An account usage limit briefly delayed the
SSH approval reviewer; deployment resumed when review became available. The
[webhook-only Nginx config](../deploy/nginx/orvessian-production-webhook-only.conf)
opens only the exact signed-revocation path after the API service starts;
all other Production paths stay closed. The production entry point permits its
**read-only private preflight** to verify the restricted database and closed
identity binding without a webhook secret; normal service startup still
requires the secret. The targeted production/WorkOS tests passed 31/31 with
loopback access. The pinned Linux replacement artifact from commit
`f7987c1d0e23` has SHA-256
`4e104c7fe98dd96c7fc37990191eedaccc66137d0bf16c34e26c7e206eb5bf60`.
It passed the exact-commit/hash replacement preflight (5,878 members), then
replaced the inactive API release with the previous `271c129f752c` release
retained for offline rollback. A transient systemd preflight ran under the
restricted `orvessian-prod-api` Unix user with protected environment files;
it returned `status: ready`, `database: verified`,
`identity: closed-admission-prepared`, and `webhook: pending`. The persistent
API unit remained disabled; no production endpoint was proxied at that
checkpoint.

Later on 13 October, the API installer verified the exact WorkOS endpoint,
event scope and active status, then installed its signing secret directly on
the VPS. WorkOS returned an unmasked 25-character alphanumeric secret rather
than the `whsec_` prefix assumed by the first installer version; a metadata-
only diagnostic identified the format, and the corrected installer passed
local tests before the one-time install. The secret value was never printed.
The protected WorkOS file is `root:root 0600` with only the API key and webhook
secret variable names. Private preflight returned `database: verified` and
`webhook: configured`.

The first normal API start exposed a code gap: `createReadiness` rejected
the `prod` environment although private preflight accepted it. A restricted
PostgreSQL-only Production readiness path was added in commit
`ed1f0f7c389392511a145da54026203745b1b13d`; its Linux startup,
readiness and signed-webhook tests passed 10/10. The Linux API archive SHA-256
is `c58f5094ead77cbc4e80c50a2e7fc8327fd1c36810778da283af440384cf5228`.
The guarded release helper accepted 5,878 members and replaced the inactive
`f7987c1d0e23` release, retaining it for rollback. Private preflight passed
again, then the Production API started on loopback. Local `/health` and
`/ready` returned 200; anonymous `/v1/session` and an unsigned webhook POST
returned 401.

The [webhook-only Nginx config](../deploy/nginx/orvessian-production-webhook-only.conf)
was applied with the [guarded edge helper](../deploy/governance/activate-production-webhook-edge.py).
It retained the original 404-only config for rollback, passed `nginx -t`,
and verified the exact public webhook path returns 401 for unsigned POSTs.
Independent HTTPS checks confirmed HTTP 401 with a valid certificate, while
the public API `/health` stayed 404. The pilot health check remained green.
The Production API is active and enabled for reboot continuity; all customer
API and portal routes remain closed. A real signed WorkOS delivery, replay
and revocation test is still required before Production identity acceptance.

### Revocation webhook activation and rollback

The completed host change was limited to signed `session.revoked` delivery. Pin the
source commit and copy the exact API installer and webhook-only Nginx template
to the VPS. Before applying either, confirm the WorkOS endpoint ID, URL,
active status and sole event, that the production API unit is inactive and
disabled, and that the pilot health check is green. Run the installer as root;
its only successful output states that the secret was installed and hidden.
Check root ownership, mode `0600` and the presence of the two expected
variable **names** in `workos.env` without printing their values. Then rerun
the production API private preflight and require `webhook: configured`.

Start the production API on loopback while its unit remains disabled. Require
HTTP 200 from local `/health` and `/ready`, HTTP 401 from anonymous
`/v1/session`, and HTTP 401 from an unsigned local POST to the WorkOS webhook.
If any check fails, stop the unit and leave Nginx on its 404-only preparation
config. After those checks pass, save the current Nginx config for rollback,
install the webhook-only config, require `nginx -t`, then reload Nginx. With
valid TLS and the intended Host/SNI, require an unsigned POST to the exact
public webhook path to return HTTP 401; `api-prod` `/health`, every other API
path and `prod` `/` must remain HTTP 404. Recheck pilot health and the API
unit, then enable the API unit for reboot continuity while the customer routes
remain closed. A production account/session must still prove a signed
delivery, replay and revocation before admission opens.

If the public route or pilot health check fails, restore the saved 404-only
Nginx config, test and reload it, disable and stop the production API unit,
then verify the webhook path is back to HTTP 404. The WorkOS endpoint can be
disabled separately if delivery will remain unavailable; do not confuse that
with revoking the signing secret. Record the before/after config hashes,
checks, timestamps and service states. No test assertion on an unsigned
request proves a valid signed WorkOS delivery.

The historical shared-cluster SQL bundle is not a release artifact here.
An isolated backup runner was staged from pinned commit `08774a1` with no
service. A distinct 32-byte production archive key was generated on the VPS;
the key and its directory are `root:root 0600` and `0700`. The key still needs
independent escrow. A quiesced production database snapshot was encrypted and
authenticated locally as backup `b864dbc2-20f1-40ef-864a-465ff7fab884`.
This capture has no worker journals because no production worker exists yet.
The production API stayed disabled and the synthetic pilot health check passed.
The capture was subsequently uploaded to the separate production B2 bucket,
discovered through its completion marker, downloaded with a separate read key,
and authenticated in a fresh closed restore. Scheduled production backup,
independent archive-key escrow and replacement-cluster recovery remain open.
The existing `capture-production-backup.py` and
`upload-production-backup-b2.py` are one-time, quiesced bootstrap tools:
capture requires the production API disabled and zero database connections,
upload refuses an existing latest-upload pointer, and both require an empty
worker-journal list. Do **not** attach them directly to a timer or describe
their initial snapshot as ongoing protection. Before the API or worker becomes
customer-facing, add a recurring runner that coordinates every production
writer, reads a protected production worker registry, authenticates the
complete journal set, safely advances the private B2 pointer only after a
completion marker, and checks each scheduled window. A production account
with no project may be tested during closed preparation, but this gate still
precedes open admission.
On 12 October a separate private, encrypted-at-rest B2 bucket named
`orvessian-prod-backups-2026` was created in `eu-central-003` at
`https://s3.eu-central-003.backblazeb2.com`. It initially had the default
"keep all versions" lifecycle. Before production admission, configure reviewed
retention rules, scheduled upload and journal inventory. Stored objects count
toward the account-wide 10 GB free allowance and can create usage charges
beyond it.
On 13 October, bucket- and `orvessian-production/prod/`-scoped B2 keys were
created: one Write Only upload key and one Read Only restore key. The first
restore key's one-time secret was not saved, so it was deleted and replaced
with key ID ending `00005`. Both active credentials were installed root-only
on Contabo. The owner approved the exact off-host transfer of snapshot
`b864dbc2-20f1-40ef-864a-465ff7fab884`. Its authenticated upload wrote a
completion marker to the private production bucket. The separate restore key
downloaded and authenticated that B2 set, then a fresh closed restore passed
as `gov_restore_prod_e0a19d786e0a` with access revoked and disabled. The
managed source database was untouched and the production API stayed disabled.
The local capture `b864dbc2-20f1-40ef-864a-465ff7fab884` was authenticated
and restored on 12 October into a separate manual-start PostgreSQL 17 cluster
bound to `127.0.0.1:5441`. Fresh database `gov_restore_prod_e6fa3bf836a0`
passed closed review with access revoked and disabled. The managed source was
not touched, the production API remained disabled and inactive, and pilot
health passed afterward. This drill used the **local** archive on the same
Contabo host. The subsequent B2 drill proves off-host custody and an
authenticated download, but still does not satisfy independent archive-key
escrow, a different-host recovery, or production service activation acceptance.

Measure production peak connections, memory, disk, query latency and evidence
backlog under the proposed limited workload. Set a conservative connection
budget and alerts. The reused cluster is single-node; document measured
recovery time and avoid an untested availability claim. Review a standby and
its current price and plan availability after launch when paying customers or
an availability commitment justify the expense.
