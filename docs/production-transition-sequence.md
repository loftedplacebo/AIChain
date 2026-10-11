# Production transition sequence — 10 October 2026

This is the next execution plan. The existing Contabo/DigitalOcean/B2 pilot
remains a synthetic `test` service with four of five project slots in use. It
does not become production by changing a hostname or WorkOS client ID.

The [11 October shared-cluster change review](production-shared-cluster-change-review.md)
records the latest read-only capacity snapshot, SQL hashes, rollback boundary,
and current database, backup, application and WorkOS release blockers.

## Selected shape

- **Local development:** private loopback PostgreSQL, API and portal with
  WorkOS Staging. Use short-lived isolated HTTPS previews only for callbacks,
  webhooks or deployment behavior that cannot be checked locally.
- **Pilot:** keep the existing hosted synthetic service and its current
  five-project cap while partner acceptance and capacity waves proceed.
- **Production:** create a separate DigitalOcean application instance and a
  separate `governance_prod` database on the existing London managed PostgreSQL
  cluster for the limited initial release. Use separate non-owner production
  API, worker and migration roles, the separate WorkOS Production environment,
  and separate secrets,
  signing/relayer keys, worker journals, and independent encrypted backups.
  Start with WorkOS hosted sign-in. Keep production traffic closed until all
  release checks pass.
- **Database separation later:** move production to its own managed cluster
  after a rehearsed export/restore and cutover when measured load, recovery or
  a customer commitment calls for it. The initial shared cluster remains one
  failure, maintenance and privileged-administrator domain for pilot and
  production; separate database names and roles do not remove that risk.
- **Evidence chain:** undecided. Do not copy the Base Sepolia contract, chain
  setting, pilot wallet or test receipts into a production approval record.
  Production receipt acceptance remains blocked until chain, contract,
  custody, gas and verification are selected and tested.

The [version-5 non-secret deployment plan](../deploy/governance/deployment-plan.example.json)
and its validator now reflect these three environments. The validator checks
declared separation of application instances, database names and runtime roles,
identity, secrets, wallets and backups. Sharing the test/production database
cluster requires an explicit topology setting and matching cluster endpoint;
the validator also accepts a dedicated production cluster for a later move.
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
| 2. Shared-cluster review | Confirm budget, region, production app size and DNS names. Create a separate app instance and production database on the existing pilot cluster. Record the real cluster ID, both database names, production roles and app ID in a private inventory. Restrict the new app's database network source. | Distinct app and database IDs, verified TLS, no pilot credential reuse, explicit denial of every pilot role against production and every production role against pilot; tested production capacity within the shared cluster. |
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
about **$30.45/month** already, so sharing it defers a second approximately
$30.45/month cluster charge. The incremental estimate excludes production
backup storage, transfer, DNS, monitoring, taxes and any other services.
These are list-price estimates, not a capacity recommendation or an order.
Measure combined pilot and production load before customer traffic. Sources:
[DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets) and
[Managed Databases](https://www.digitalocean.com/pricing/managed-databases).

The existing database is single-node, with 2 GiB RAM, 30 GiB storage and a
displayed 47-connection limit. A pilot or production spike, maintenance event
or cluster outage can affect both services. DigitalOcean states that Standard
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

The production app and WorkOS Production activation are billable-account
actions. Prepare exact resource settings, budget and rollback record first;
then obtain owner approval for the purchase. Production traffic, real customer
data and mainnet funding require later, separate go/no-go decisions.

## Shared-cluster release conditions and future split

The current pilot bootstrap revokes `PUBLIC` access to `governance_test`.
Production setup must separately revoke `PUBLIC` access to `governance_prod`,
grant only its own non-owner runtime and migration roles, and verify that
neither environment's roles can connect to the other database. Verify schema,
table and role-membership denials using the actual runtime identities; never
place the shared `doadmin` credential in either application. Keep pilot and
production backup destinations, encryption keys, journals, completion markers
and restore procedures separate. A database-only separation does not isolate
the common cluster administrator, network endpoint, maintenance or capacity.

The repository now prepares a non-secret SQL review bundle with
`npm run governance:prepare-production-shared-db-sql`. It writes a bootstrap,
API grants, worker grants and a bidirectional `CONNECT` check under the ignored
`build/governance/production-shared-db-sql` directory and prints their hashes.
It does not connect to or change the cluster. Review the exact SQL and hashes,
create the separate production database and three production login roles with
protected credentials, then apply the bootstrap while connected to production.
Apply migrations under the production migration role before the generated
runtime grants. Run the final isolation check with `ON_ERROR_STOP=1` and also
attempt cross-database logins with actual pilot and production runtime roles.
The named-role check cannot prove lack of a privileged administrator or an
unreviewed role membership; inspect both separately. Do not run these steps on
the live cluster until the production change has its own reviewed release record.

Before production admission, measure peak combined connections, memory, disk,
query latency and evidence backlog under the proposed limited workload. Set a
conservative production connection budget and alerts. Document that a cluster
failure can interrupt both services; do not advertise an availability target
until replacement-cluster recovery and operations are measured. Reassess a
dedicated production cluster before increasing the pilot cohort, accepting an
availability commitment, or when shared capacity or incident isolation fails
its reviewed threshold. Rehearse the move with an authenticated backup,
independent restore, new endpoint and roles, application cutover and rollback;
retire shared access only after the new service and backup pass acceptance.
