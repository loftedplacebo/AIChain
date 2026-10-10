# Production transition sequence — 10 October 2026

This is the next execution plan. The existing Contabo/DigitalOcean/B2 pilot
remains a synthetic `test` service with four of five project slots in use. It
does not become production by changing a hostname or WorkOS client ID.

## Selected shape

- **Local development:** private loopback PostgreSQL, API and portal with
  WorkOS Staging. Use short-lived isolated HTTPS previews only for callbacks,
  webhooks or deployment behavior that cannot be checked locally.
- **Pilot:** keep the existing hosted synthetic service and its current
  five-project cap while partner acceptance and capacity waves proceed.
- **Production:** create a separate DigitalOcean application instance and
  managed PostgreSQL cluster, use the separate WorkOS Production environment,
  and create separate secrets,
  signing/relayer keys, worker journals, and independent encrypted backups.
  Start with WorkOS hosted sign-in. Keep production traffic closed until all
  release checks pass.
- **Evidence chain:** undecided. Do not copy the Base Sepolia contract, chain
  setting, pilot wallet or test receipts into a production approval record.
  Production receipt acceptance remains blocked until chain, contract,
  custody, gas and verification are selected and tested.

The [version-4 non-secret deployment plan](../deploy/governance/deployment-plan.example.json)
and its validator now reflect these three environments. The validator checks
declared separation of application instances, database clusters, identity,
secrets, wallets and backups. A valid result is still `releaseReady:false`:
provider account ownership, actual resource IDs, permissions and restore
evidence need independent verification.

Read-only WorkOS account inspection on 10 October found a Production environment
in the original Orvessian project, separate from the pilot project's Staging
environment. The workspace reports `productionState: Inactive` and
`hasActiveBilling: false`. Production AuthKit cannot be activated until the
owner adds billing information. No production API key or customer account has
been created for this transition.

## Execution order

| Gate | Work | Completion evidence |
| --- | --- | --- |
| 1. Local development | Recheck the existing private PostgreSQL cluster, loopback API and WorkOS Staging configuration; run sign-in and one synthetic local customer journey. | No pilot or production credentials in local data; API readiness, scoped keys and session tests pass. |
| 2. Production resource review | Confirm budget, region, initial size and DNS names. Create new app instance and new managed DB cluster, not a new database on the pilot cluster. Place them in a restricted network and record exact resource IDs in a private inventory. | Distinct app and cluster IDs, TLS, restricted DB roles, firewall and no pilot credential reuse. |
| 3. Production identity | Owner enables WorkOS Production billing; configure free hosted AuthKit, MFA, exact HTTPS callbacks and signed webhook; create new production API key and sealing key in protected storage. | Fresh production account passes sign-in, MFA, recovery, revocation and webhook replay tests; staging identities are not assumed to transfer. |
| 4. Runtime and backup | Build pinned API, worker and portal artifacts; apply migrations and strict roles; deploy behind private readiness checks. Configure independent encrypted backup, retention and alerts. | Green release gates, hashes, scoped read/write/denial checks, current backup marker and every worker registered. |
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

An indicative small starting stack is a 4 GiB/2 vCPU Basic Droplet at
**$24/month** and a separate 2 GiB/1 vCPU managed PostgreSQL Standard
single-node cluster at **$30.45/month**, about **$54.45/month** combined before
backup storage, transfer, DNS, monitoring, taxes and any other services.
These are current list prices, not a capacity recommendation or an order.
Review sizing against measured load before customer traffic. Sources:
[DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets) and
[Managed Databases](https://www.digitalocean.com/pricing/managed-databases).

The proposed database is single-node. DigitalOcean states that Standard
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

Resource creation and WorkOS Production activation are billable-account
actions. Prepare exact resource settings, budget and rollback record first;
then obtain owner approval for the purchase. Production traffic, real customer
data and mainnet funding require later, separate go/no-go decisions.
