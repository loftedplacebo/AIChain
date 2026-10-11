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
public sign-up remains closed. No production API key or customer account has
been created for this transition. The current $0 invoice estimate is not a
spending cap; see the [change review](production-shared-cluster-change-review.md)
for optional WorkOS meters and remaining configuration.

## Execution order

| Gate | Work | Completion evidence |
| --- | --- | --- |
| 1. Local development | Recheck the existing private PostgreSQL cluster, loopback API and WorkOS Staging configuration; run sign-in and one synthetic local customer journey. | No pilot or production credentials in local data; API readiness, scoped keys and session tests pass. |
| 2. Pilot database cutover | Install local PostgreSQL on Contabo, migrate the complete pilot database under a writer pause, repoint services and health checks, then verify backup and closed restore. Keep the managed copy as rollback until acceptance. | Receipts, projects, key revocations, worker journals, B2 backup, closed restore and health all pass. |
| 3. Production cluster preparation | The reviewed on-demand coordinated B2 backup and independent closed restore passed. Six named managed pilot/restore databases and three pilot roles were retired. The empty `governance_prod` database and three restricted `NOLOGIN` roles were created and verified. Rotate the admin credential and restrict trusted sources when the production app endpoint exists. | No pilot object remains on the managed cluster; empty production bootstrap and restricted role checks passed. Admin rotation and network restriction remain open. |
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
On 11 October its pinned unit hash and read-only preflight passed, then
`--apply` staged `orvessian-prod-api` with `/usr/sbin/nologin`, the empty
root-owned `/opt/aichain/orvessian-production-api` directory, and
`orvessian-production-api.service`. Independent `systemctl show` reported
`UnitFileState=disabled` and `ActiveState=inactive`; the synthetic pilot health
check remained green. No production release artifact, environment file,
database login, public route or customer traffic was activated.

On 10 October, the existing isolated local `dev` PostgreSQL cluster started,
the loopback API returned HTTP 200 for `/health` and `/ready` and HTTP 401 for
an anonymous `/v1/session`, then both processes were stopped. This is a
readiness check for Gate 1, not the full browser, MFA or receipt journey.

On 11 October, the WorkOS Production AuthKit callback, logout return, web
origin, homepage and initiate-login URL were configured for the temporary
`prod.orvessian.com` preparation hostname. MFA remains required and public
sign-up closed. The [production identity change review](production-identity-change-review.md)
records the application-side closed-admission guard and the remaining live
host, credentials, webhook and account acceptance work. No production user or
webhook exists yet.

Keep the existing portal/API hostnames on the pilot during preparation. Use
separate temporary production hostnames on Contabo and register their exact
WorkOS callbacks. Plan the eventual domain switch and rollback only after the
new services pass end-to-end acceptance. Do not import pilot users, workspaces,
API keys or testnet evidence as live customer records by assumption.

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

The empty `governance_prod` database and restricted `NOLOGIN` API, worker and
migration roles already exist on the reused cluster. Set distinct credentials,
apply reviewed migrations and post-migration grants, and verify runtime grants
and denials. Never put `doadmin` in a service. The reviewed production-only SQL
bundle has already applied its bootstrap; its post-migration grant files remain
pending. The historical shared-cluster bundle is not a release artifact here.
Use independent production encryption keys, backup destination, journals,
completion marker and restore procedure. Rehearse a restore to a replacement
cluster before production admission.

Measure production peak connections, memory, disk, query latency and evidence
backlog under the proposed limited workload. Set a conservative connection
budget and alerts. The reused cluster is single-node; document measured
recovery time and avoid an untested availability claim. Review a standby and
its current price and plan availability after launch when paying customers or
an availability commitment justify the expense.
