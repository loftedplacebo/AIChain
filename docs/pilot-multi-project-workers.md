# Repeatable multi-project pilot workers — rollout, 6 October 2026

This is the implementation and operator procedure for Stage C's worker, backup
and monitoring work. The code was deployed to the pilot VPS on 6 October 2026
and the existing worker was registered. A second internal synthetic project was
provisioned with a dedicated worker, then funded and activated. A two-journal
version-2 B2 upload, independent closed restore and combined health check
passed. Concurrent evidence remains open. The hosted pilot
remains synthetic `test` on Base Sepolia. See the [rollout record](deployments/stage-c-vps-rollout-2026-10-06.md).

## Inventory and provisioning contract

The root-owned `/etc/aichain/pilot-workers.json` registry is the complete
inventory of pilot evidence workers. Each entry binds one tenant/project to a
service unit, journal, recorder and relayer. The legacy Synthetic Validation
worker keeps the `worker` archive role. Additional projects use a stable
`worker_` role derived from SHA-256 of the tenant and project IDs. The registry
rejects duplicate projects, roles, units, journals and wallet addresses. Its
current bound is 30 workers; backup archives allow 32 journals to leave room
for other journal roles. The Python and Node validators enforce the same
project role calculation and entry shape.

Roll out the new source to the existing isolated pilot runtime and backup
runner before changing services. Install
`deploy/systemd/aichain-governance-project-worker@.service` into
`/etc/systemd/system/`, then run `systemctl daemon-reload` and
`systemd-analyze verify`. Keep the existing single-project worker running.
From the staged source, run `bootstrap-pilot-worker-registry.py` as root. It
reads the existing protected key files to derive public addresses, verifies
the test-bound journal, and writes the private registry; it prints no key.
Review the registry and run the new read-only runtime and project inventory
checks before enabling the new scheduled health path. Existing customer
projects without a worker will deliberately make project inventory unhealthy.

For each approved synthetic project, create a root-owned `0600` JSON request:

```json
{
  "tenant": "org-REPLACE_WITH_PROJECT_WORKSPACE_ID",
  "project": "prj-REPLACE_WITH_PROJECT_ID",
  "databaseUrlFile": "/etc/aichain/governance-workers/project-database-url",
  "databaseCaFile": "/etc/aichain/governance/digitalocean-ca.crt",
  "rpcUrl": "https://sepolia.base.org",
  "workerPolicy": {
    "batchSize": 100,
    "maxTransactionsPerHour": 10,
    "maxGasPriceWei": "100000000",
    "dailyReservationWei": "1000000000000000",
    "l1AllowanceWei": "10000000000000"
  },
  "fundingTargetWei": "1000000000000000",
  "reviewId": "REPLACE_WITH_OPERATOR_REVIEW_ID"
}
```

The database URL file must also be root-owned `0600`, contain one verified-TLS
PostgreSQL URL, and be readable only by the provisioner. The request is the
protected record of the reviewed gas policy, funding target and project
binding; retain it in the operator's private inventory. Set values from the
actual project and approved pilot spending limit, not by copying an example.

Run `provision-pilot-project-worker.py request.json` as root. It takes an
exclusive lock, creates or validates a dedicated `ov_<instance>` Unix user,
private state and key files, a root/group protected environment file, and a
paused one-shot worker journal. It verifies the journal's scope, chain and
public signer addresses before adding the project to the registry. Repeating
the same request validates the existing result; changed bindings fail closed.
The command prints only the role, unit, public addresses, funding target and
review ID. A failed partial setup stays visible for operator inspection and
can be retried with the same request. Do not delete a possibly signed journal
or change a relayer key to resolve a failure.

After the relayer address has the reviewed Base Sepolia funding target, run
`provision-pilot-project-worker.py --activate request.json`. This checks the
actual chain ID and read-only wallet balance, enables the prepared unit, and
marks the registry entry active. If service start or registry update fails,
the command stops the unit and returns its environment to paused. Repeat only
after inspecting durable journal and chain state. No key or funding transfer
is performed by provisioning. These are dedicated worker instances of the
same code, each with its own journal, recording key and relayer nonce owner.

## Backup and recovery coverage

`run-pilot-backup-once.py` now loads the protected registry, verifies every
journal's identity, requires every active unit to be available, stops every
registered worker with the portal/API, and captures all journals in one
coordinated encrypted PostgreSQL archive. A missing journal aborts the backup.
The archive role list must equal the registry role set before upload. The B2
completion pointer records the authenticated upload's journal roles in version
2; backup health fails when its role set differs from the current registry.
An older version-1 pointer can still be read by offline tooling, but cannot
pass the new hosted multi-project backup health check. Schedule a fresh backup
after registry migration or adding a project.

The archive, encrypted object copy, download, key rotation and closed restore
accept bounded project worker roles while still reading the legacy `worker`
role. `verify-pilot-b2-restore.py` requires the downloaded and restored role
sets to equal the current registry, checks each restored journal's scope and
signer binding, and then runs the existing closed PostgreSQL review. The
restored service remains disabled pending the separate recovery release review.
If the registry changed after a backup, restore verification fails against the
current inventory as intended; select an archive captured after the change.

## Monitoring and acceptance

The runtime check reads every registered unit and journal, checks journal
scope and signer binding, and reports stalled or repeatedly failing jobs per
role. The app-data check reads evidence backlog for each registered project
under scoped API queries. A separate root-only catalog check uses the
protected offline administrator credential to compare every PostgreSQL
customer project against the registry; the API role cannot enumerate other
tenants. The combined hosted check requires all three results to pass.

Local evidence: `node --test` passes the project inventory, backup pointer,
monitor, object storage and recovery cases. The native synthetic PostgreSQL
recovery run `r0e7a39144b23` passed, including two distinct project worker
journals through encrypted capture, authenticated inspection, gated restore
and review. The managed-like native administrator test also passed two worker
journals through synthetic S3 upload, download, monitor, filesystem copy and
closed restore. The local Python registry, journal binding and request tests
pass. The [6 October hosted rollout](deployments/stage-c-vps-rollout-2026-10-06.md)
then passed independent B2 download and closed restore of a populated
two-journal set after both projects had confirmed Base Sepolia evidence.

The two synthetic projects have separate active workers, confirmed evidence,
scoped isolation, coordinated B2 capture and closed restore. Missing-worker
detection and an injected stale-job threshold check passed. Stage C owner
sign-off still needs a supported project count, workload and latency limits
accepted by the existing primary owner. An alternate contact remains a
separate first-partner trial gate. The first partner's acceptance and any
production-data release remain separate gates.

The bounded simultaneous load subsequently accepted and independently
verified ten synthetic SDK receipts in each project. One operator receipt
waited at the ten-transaction rolling-hour policy cap while its watcher used
the same budget; it mined 380 seconds after acceptance. The [capacity smoke
record](pilot-stage-c-capacity-smoke.md) proposes eight new receipts per
project per rolling hour with a 30-minute evidence target for owner review.
