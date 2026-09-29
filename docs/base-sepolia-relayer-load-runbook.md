# Base Sepolia capped relayer and synthetic load runner

## Relayer boundary

`services/relayer/base-sepolia-capped-relayer.js` validates a prepared synthetic
batch against Base Sepolia chain ID, configured contract, publisher, calldata,
zero transaction value, and maximum receipt count. It estimates gas, applies a
gas-price ceiling, reserves a daily wei budget, limits transactions per hour,
and persists reservations before broadcast. Submission calls are serialized
inside one process so concurrent requests cannot race those limits.

The relayer defaults to paused. It never loads key material. A signer must be
injected by a separately reviewed provider (for example, an HSM/KMS adapter or
an explicitly managed service account). The configured signing address must
match the publisher. Dry-run mode returns the capped quote without sending.
The JSON budget ledger is a local alpha mechanism; production requires a
transactional shared store and a single-writer or distributed lock.

Run the policy tests with `npm run test:base-relayer`. They use a mock RPC and
signer and cannot broadcast to Base.

## Installed VPS service

The VPS service is installed as
`aichain-base-sepolia-synthetic-ingress.service` and listens on
`127.0.0.1:8787`. See [the installation record](vps-base-sepolia-synthetic-ingress.md)
for runtime, permissions, and service controls. The test API key is in the
root-only systemd environment file and is not shown here.

The VPS-local 1/10/25 receipts-per-second rehearsal completed with 2,162
accepted receipts and zero failures; restart recovery restored the full queue.
Its report is linked from the installation record.

A synthetic-only 24-hour soak (run ID `vps-24h-soak-20260923`) completed on
2026-09-24. The report is on the VPS at
`/var/lib/aichain-base-sepolia-ingress/reports/vps-24h-soak-20260923.json`.
It accepted 15,550 receipts over 86,383 seconds with zero failures. Queue depth
rose from 2,162 to 17,712; `/health` reported all records retained. Measured
request latency was 3.606 ms p50, 24.673 ms p95, and 840.428 ms maximum. This
exercises synthetic ingress and the local journal only; it does not exercise
relaying, signing, or Base settlement.

The transient systemd launch for this run failed at first because its installed
runner version rejected the fractional rate. A separate load-generator process
completed the run and wrote the report. Therefore the ingress acceptance soak
passed, but this result does not establish systemd supervision of the load
generator. The ingress queue remains at 17,712 of its 20,000-record capacity;
do not add another load run until the current synthetic records are safely
archived or the queue is otherwise deliberately prepared for a new test.

## Python load runner

`scripts/synthetic_ingress_load.py` creates valid synthetic AVR presentations
and submits them to the authenticated ingress API. It never prepares an anchor,
signs a transaction, or submits to Base. Keep the API key in the process
environment or a secret manager; do not put it on the command line.

To run another VPS rehearsal as root, load the secret from the protected
systemd environment file into the shell and run the staged generator:

```sh
set -a
. /etc/aichain-base-sepolia-synthetic-ingress.env
set +a
export AICHAIN_SYNTHETIC_INGRESS_URL=http://127.0.0.1:8787
python3 /opt/aichain/base-sepolia-ingress/scripts/synthetic_ingress_load.py --rates 1 --seconds 60 --max-receipts 1000 --max-queue 18000 --run-id vps-stage-1 --output /var/lib/aichain-base-sepolia-ingress/reports/vps-stage-1.json
python3 /opt/aichain/base-sepolia-ingress/scripts/synthetic_ingress_load.py --rates 10 --seconds 60 --max-receipts 1000 --max-queue 18000 --run-id vps-stage-10 --output /var/lib/aichain-base-sepolia-ingress/reports/vps-stage-10.json
python3 /opt/aichain/base-sepolia-ingress/scripts/synthetic_ingress_load.py --rates 25 --seconds 60 --max-receipts 2000 --max-queue 18000 --run-id vps-stage-25 --output /var/lib/aichain-base-sepolia-ingress/reports/vps-stage-25.json
```

The script rejects plaintext remote URLs, supports fractional rates for a
low-volume soak, records latency percentiles and health snapshots, stops after
any submission failure or when queue depth reaches the configured ceiling, and
writes one JSON report per run under
`build/base-sepolia/vps-load-runs/`. Each rehearsal needs a fresh ingress queue
or enough remaining queue capacity because receipt IDs remain deduplicated.

These staged runs measure API acceptance and local durable persistence only.
They do not publish anchor transactions. The synthetic-only soak can validate
ingress and journal behaviour without a signer. Before any test that anchors
transactions, restart/recovery, the production durable store, alerting, a
reviewed signer adapter, and daily gas controls must be in place. A
10,000-receipt batch size means one million daily receipts need approximately
100 anchor transactions per day, subject to the maximum batch age and observed
queue behaviour.
