# VPS-backed portal and 24-hour reliability run — 2026-09-27

## Portal cutover

The local website now uses `GOVERNANCE_API_URL=http://127.0.0.1:8794` in its
ignored environment files. An SSH forward connects local 8794 to VPS loopback
8795. `aichain-governance-api.service` is active and enabled at boot and shares
the authoritative VPS synthetic database with the worker. No API port is public.

Both synthetic account logins, reports and cross-tenant evidence denial passed
on the VPS. Browser verification shows **northstar · VPS synthetic test**, with
the ten-record VPS batch and its confirmed Base state. Previous local sessions
do not authenticate to this backend. New synthetic account details are stored in
ignored `build/workspace-local/vps-access.json`; the ingest token stays on the VPS.
This is still a development portal, not production identity or public hosting.

Reconnect the development tunnel if the laptop/session disconnects:

```text
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:8794:127.0.0.1:8795 root@62.171.161.32
```

The tunnel is a development dependency, not a production availability mechanism.
The API loads no signing keys. API and worker currently share the same restricted
OS account for SQLite access; process-level credential separation and managed
database roles remain a production gate. SQLite now uses a five-second busy
timeout to tolerate short writer contention between API and worker.

## Fixed reliability soak

`aichain-governance-soak.service` runs `scripts/governance_soak.py` on the VPS.
It submits synthetic bounded governance JSON through the authenticated API,
rather than inserting directly into storage. It holds no wallet signing key.

- Duration: 24 hours from persisted start time, with a 24-hour-10-minute systemd
  runtime ceiling per process activation. Resume never resets the saved end time.
- Rate: 100 records at the start of each hour, paced approximately 10/second.
- Maximum: 2,400 unique record IDs; retries retain the same payload and ID.
- Stops: 20 cumulative request errors, 1,000 unsigned pending records, or a
  blocked worker observed during the monitoring interval.
- Worker limits remain 10 new transactions/hour, 0.1 gwei maximum gas price and
  0.001 test ETH conservative reservation budget per rolling 24 hours. The L1 fee
  allowance is not a protocol-enforced total fee cap; wallet balance is limited.
- Checkpoint after each accepted request; every ~15 seconds between hourly bursts
  record worker job-state counts. Persist counts, retries, errors and maximum API
  latency in `/var/lib/aichain-governance-worker/soak-24h.json`.
- Service is started for this run, not enabled as a recurring boot-time job.
  It stops when complete; the API and worker continue running.

This first run validates sustained operation and recovery, **not high-throughput
capacity**. At most 2,400 records keeps the prototype report's 10,000-event limit
usable. Soak records use agent `synthetic-24h-soak`; they have no adjudicated
outcomes and will increase pending labels, not measured accuracy. They are
fabricated and must never be presented as real model results.

## Checking results

```text
systemctl status aichain-governance-soak aichain-governance-api aichain-governance-worker
cat /var/lib/aichain-governance-worker/soak-24h.json
journalctl -u aichain-governance-worker --since today
```

`completed` means all scheduled API submissions finished, not that every receipt
is currently chain-confirmed. After the run, reconcile every soak event to a
signed bundle and confirmed journal batch, recheck representative live anchors,
check errors/duplicates/gas/balance, and verify there are no unresolved jobs.
Do not declare the 24-hour test passed from its successful start.

Initial checkpoint: first 100 records accepted, zero duplicates/errors, maximum
observed API latency 116 ms. Eight worker/workspace tests passed locally; Python
syntax was verified on the Linux host. Start and end timestamps are recorded in
the saved checkpoint, which is the authority if the service is resumed later.

Stop the test with `systemctl stop aichain-governance-soak`; preserve its checkpoint.
Stop the worker separately to stop additional broadcasting. Do not delete the
wallet journal or run the local publisher in parallel. No automatic user-message
notification has been configured; metrics persist on the VPS for review.
