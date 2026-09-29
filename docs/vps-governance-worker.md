# VPS governance worker — active 2026-09-27

Target: existing Contabo host `62.171.161.32`.

## Installed and verified

- Curated application and locked runtime dependencies: `/opt/aichain/governance-worker`.
- Existing Node 24.21.0 toolchain; dependency install used `npm ci --omit=dev --ignore-scripts`.
- Dedicated unprivileged service account: `aichain-governance`.
- Private writable state directory: `/var/lib/aichain-governance-worker` (0700).
- systemd unit: `aichain-governance-worker.service`, with restart-on-failure,
  resource limits, read-only system paths and a single writable state directory.
- Root-only environment configuration: `/etc/aichain-governance-worker.env`.
- Service configuration validation passed. Eight worker/evidence tests passed
  directly on the Linux VPS. Existing ingress and indexer remain active.

The service is **active and enabled at boot**, with `GOVERNANCE_WORKER_ENABLED=true`.
No new listening ports or public endpoints were added. After explicit user approval,
the two dedicated testnet keys, consistent synthetic database snapshot and existing
transaction journal were transferred over SSH and installed with mode 0600.
Keys are accessible only to root and the dedicated service owner. Local launcher
ownership is disabled through `build/workspace-local/worker-host.json`.

## Approved migration (completed)

Transfer over SSH to the private root staging directory, then install with 0600
permissions for the service account:

| Local source | Intended destination |
|---|---|
| `build/workspace-local/recording-service.key` | `/var/lib/aichain-governance-worker/keys/recording-service.key` |
| `build/workspace-local/relayer.key` | `/var/lib/aichain-governance-worker/keys/relayer.key` |
| Consistent `events.sqlite` backup | `/var/lib/aichain-governance-worker/events.sqlite` |
| Consistent `worker.sqlite` backup | `/var/lib/aichain-governance-worker/worker.sqlite` |

The receipt key can attest records; the gas key can spend the dedicated testnet
wallet balance. Anyone with sufficient VPS access could use those capabilities.
The database contains synthetic records only; journal signed bytes are sensitive.
Do not export customer data, account files, production keys or the Fluxora key.

The database snapshots have been prepared locally through the SQLite backup API
under ignored `build/governance-vps-stage`. Refresh them immediately before the
approved transfer. Do not copy live WAL databases as ordinary files.

Before enabling the service, create the local `worker-host.json` ownership marker
so the local launcher refuses to use the wallet. Confirm no local worker process
or journal lock remains. Preserve the journal and its existing nonce history;
never start a second journal for the same publisher. Local copies become inactive
recovery material, not a second active worker.

## Acceptance procedure

1. Import approved state/keys; verify ownership, file permissions and journal identity.
2. Enable testnet operation, start systemd, confirm existing job reconciliation.
3. Graceful service restart; verify no duplicate transaction.
4. Controlled process termination: systemd pre-start recovery removes a stale lock
   only after proving its recorded PID no longer exists. It refuses living owners.
5. Controlled RPC outage and recovery, then a small synthetic batch on the VPS.
6. Record transaction, canonical confirmation, journal attempts and independent
   evidence verification. Only then schedule a longer bounded load test.

The VPS receives a synthetic snapshot; the local portal continues using its local
database. No data synchronization or portal backend cutover is implied by this
worker deployment. A deliberate API/portal cutover is a separate step.

Rollback: stop and disable the worker service, preserving its state and keys.
Never reactivate the local wallet without reconciling the latest VPS journal.

## Supervised VPS acceptance passed — 2026-09-27

The approved migration is complete. aichain-governance-worker is active and enabled at boot on 62.171.161.32; the local gas-wallet launcher is disabled. Graceful restart and a forced SIGKILL both recovered safely. A simulated RPC outage retained ten pending synthetic records without broadcasting; restoring RPC automatically prepared and submitted one ten-record batch. Transaction 0x53f57a7dec72b734bd59fd82bb4072ca9f2b48f421d719864549a0afcb842473 confirmed in block 47373519 with 25 L2 confirmations at the saved check. The journal records nonce 1 and one broadcast attempt for this new batch; no duplicates and no pending records remain. Existing ingress/indexer stayed active. The worker used approximately 34 MiB RAM at final check.

See [saved validation](validation/governance-vps-worker-2026-09-27.json). The service remains running with the existing fee/rate caps. No 24-hour load generator was started. The local portal still reads its local database; the VPS acceptance records require a deliberate backend cutover to appear there.

## VPS portal cutover and soak started — 2026-09-27

The local portal now reads the authoritative VPS API through a loopback SSH tunnel. Both workspace logins and tenant isolation passed; the browser displays a VPS-created record with Base confirmation. A bounded 24-hour API soak is running at 100 synthetic records/hour (2,400 maximum), with error/backlog stops and existing gas limits. The first 100 were accepted with zero errors. This is sustained reliability testing, not maximum-throughput testing. Completion remains pending. See [portal and soak runbook](governance-vps-portal-and-soak.md).
