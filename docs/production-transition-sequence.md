# Production transition sequence — 11 October 2026

This is the next execution plan. The existing Contabo/DigitalOcean/B2 pilot
remains a synthetic `test` service with four of five project slots in use. It
does not become production by changing a hostname or WorkOS client ID.

The [11 October shared-cluster change review](production-shared-cluster-change-review.md)
records the earlier proposal and baseline. The owner has selected the
[Contabo test / DigitalOcean production cutover](production-architecture-cutover-note.md)
instead. Do not apply the shared-cluster proposal as written.

## Selected shape

- **Local development:** private loopback PostgreSQL, API and portal with
  WorkOS Staging. Use short-lived isolated HTTPS previews only for callbacks,
  webhooks or deployment behavior that cannot be checked locally.
- **Pilot:** keep the hosted synthetic portal, API and workers on Contabo and
  move their complete `governance_test` database to PostgreSQL on that VPS.
  Keep the managed pilot database as rollback until local service, backup and
  closed-restore acceptance pass. Keep the five-project cap until measured.
- **Production:** repurpose the existing London DigitalOcean managed PostgreSQL
  cluster exclusively for production after the pilot cutover, with a separate
  DigitalOcean application instance. Use non-owner production
  API, worker and migration roles, the separate WorkOS Production environment,
  and separate secrets,
  signing/relayer keys, worker journals, and independent encrypted backups.
  Start with WorkOS hosted sign-in. Keep production traffic closed until all
  release checks pass.
- **Availability later:** the reused managed cluster is single-node at launch.
  Reassess a standby after launch as paying customers and an availability target
  justify its cost. Independent backups and replacement-cluster recovery remain
  required.
- **Evidence chain:** undecided. Do not copy the Base Sepolia contract, chain
  setting, pilot wallet or test receipts into a production approval record.
  Production receipt acceptance remains blocked until chain, contract,
  custody, gas and verification are selected and tested.

The [version-5 non-secret deployment plan](../deploy/governance/deployment-plan.example.json)
and its validator reflect the earlier shared-cluster proposal. Update the
example and validator to the selected Contabo test database and exclusive
DigitalOcean production cluster before production release.
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
| 3. Production cluster preparation | After pilot cutover and retention review, remove pilot credentials and database from the managed cluster; create fresh production roles and database. Restrict network access to the production app and operator path. | No pilot runtime dependency or credential on the managed cluster; production grants and actual login denials pass. |
| 3. Production identity | Owner enables WorkOS Production billing; configure free hosted AuthKit, MFA, exact HTTPS callbacks and signed webhook; create new production API key and sealing key in protected storage. | Fresh production account passes sign-in, MFA, recovery, revocation and webhook replay tests; staging identities are not assumed to transfer. |
| 4. Runtime and backup | Build pinned API, worker and portal artifacts; apply migrations and strict roles in the production database; deploy behind private readiness checks. Configure production-specific encrypted backup, journals, retention and alerts that do not silently reuse the pilot backup set. | Green release gates, hashes, scoped read/write/denial checks in both databases, current production backup marker and every worker registered. |
| 5. Recovery | Restore when the original managed DB cluster is unavailable, review every journal and access state, then activate an isolated replacement service. | Measured recovery point and time, revoked captured access, receipt proof preservation and successful post-restore customer journey. |
| 6. Public acceptance | Finish abuse, security and privileged-access review; legal pages, support/privacy/security inboxes, real-data terms, capacity and incident rehearsal. Decide and test production evidence chain. | Owner go/no-go record and claims limited to tested capacity and recovery. |

On 10 October, the existing isolated local `dev` PostgreSQL cluster started,
the loopback API returned HTTP 200 for `/health` and `/ready` and HTTP 401 for
an anonymous `/v1/session`, then both processes were stopped. This is a
readiness check for Gate 1, not the full browser, MFA or receipt journey.

Keep the existing portal/API hostnames on the pilot during preparation. Use
separate temporary production hostnames and register their exact WorkOS
callbacks. Plan the eventual domain switch and rollback only after the new
stack passes end-to-end acceptance. Do not import pilot users, workspaces,
API keys or testnet evidence as live customer records by assumption.

## Budget decision before provisioning

An indicative separate 4 GiB/2 vCPU Basic Droplet is **$24/month**. The
existing 2 GiB/1 vCPU managed PostgreSQL Standard single-node cluster costs
about **$30.45/month** already and will be reused exclusively for production.
The local PostgreSQL 17 test cluster uses spare Contabo VPS capacity; it does
not add a managed database subscription. The incremental estimate excludes
production backup storage, transfer, DNS, monitoring, taxes and other services.
These are list-price estimates, not a capacity recommendation or an order.
Measure production load before customer traffic. Sources:
[DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets) and
[Managed Databases](https://www.digitalocean.com/pricing/managed-databases).

The existing database is single-node, with 2 GiB RAM, 30 GiB storage and a
displayed 47-connection limit. The pilot will no longer share its connections
or cluster maintenance after the database cutover. DigitalOcean states that Standard
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

The production app is a billable-account action. Prepare exact resource
settings, budget and rollback record before purchase. Production traffic, real customer
data and mainnet funding require later, separate go/no-go decisions.

## Database release conditions and standby review

The pilot database was copied and accepted on Contabo on 11 October 2026,
including its worker registry, key revocations, fresh receipt proof, encrypted
off-host backup and independent closed restore. The managed pilot copy remains
the rollback source through the next scheduled local backup cycle and retention
review. Only then may the managed test database and roles be retired, under a
separate reviewed retention and access change. Rotate the
managed administrator password before production use and restrict trusted
sources to the production application and reviewed operator access.

Create `governance_prod` and fresh non-owner API, worker and migration roles on
the reused cluster. Revoke `PUBLIC` access, verify actual runtime grants and
denials, and never put `doadmin` in a service. The existing shared-cluster SQL
bundle is not a production release artifact for this topology; regenerate and
review a production-only bootstrap and grant bundle before applying migrations.
Use independent production encryption keys, backup destination, journals,
completion marker and restore procedure. Rehearse a restore to a replacement
cluster before production admission.

Measure production peak connections, memory, disk, query latency and evidence
backlog under the proposed limited workload. Set a conservative connection
budget and alerts. The reused cluster is single-node; document measured
recovery time and avoid an untested availability claim. Review a standby and
its current price and plan availability after launch when paying customers or
an availability commitment justify the expense.
