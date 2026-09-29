# VPS Base Sepolia synthetic ingress installation

Installed on the VPS on 22 September 2026 as an isolated, synthetic-only
development service.

## Runtime and service

- Node.js `v24.21.0` LTS, installed under
  `/opt/aichain/.toolchains/node-v24.21.0-linux-x64`; the official archive
  SHA-256 checksum was verified before extraction.
- Curated app bundle at `/opt/aichain/base-sepolia-ingress`, with pinned
  `ethers` `6.16.0` runtime dependency.
- systemd unit `aichain-base-sepolia-synthetic-ingress.service`, enabled at
  boot and running as the unprivileged `aichain-ingress` account.
- API listener at `127.0.0.1:8787`; it is not exposed on the public interface.
- State and reports under `/var/lib/aichain-base-sepolia-ingress`.
- Synthetic API key in `/etc/aichain-base-sepolia-synthetic-ingress.env`,
  owned by root with mode `0600`. The service receives it through systemd.
- Batch limit 10,000 receipts; pending queue limit 20,000. systemd limits the
  service to 512 MiB, two CPU cores, and 128 tasks.

The app accepts authenticated synthetic presentations and prepares unsigned
transactions for review. It has no signer or relay capability. Its root-only
API key was generated on the VPS and was not copied to the workstation or
included in this repository.

The installed service definition and pinned runtime package are captured in
[`deploy/systemd/aichain-base-sepolia-synthetic-ingress.service`](../deploy/systemd/aichain-base-sepolia-synthetic-ingress.service)
and [`deploy/base-sepolia-ingress/package.json`](../deploy/base-sepolia-ingress/package.json).

Service operations:

```sh
systemctl status aichain-base-sepolia-synthetic-ingress.service
systemctl restart aichain-base-sepolia-synthetic-ingress.service
curl http://127.0.0.1:8787/health
```

For a local client, use an SSH port forward to reach the loopback listener.
Do not expose port 8787 publicly.

## VPS-local staged test

The Python runner executed on the VPS against the installed service at 1, 10,
and 25 receipts per second for 60 seconds each. It accepted 2,162 synthetic
receipts with zero failures. Latency was 3.176 ms p50, 17.614 ms p95, and
135.241 ms maximum. No Base transaction was prepared or sent.

After a systemd restart, health reported all 2,162 receipts still queued and
retained, with zero rejected or failed records. The report is stored in
ignored build output at
`build/base-sepolia/vps-load-runs/vps-local-stage-20260922.json`.

These results are a short synthetic rehearsal. They do not establish a
24-hour service limit, customer capacity, Base settlement throughput, or mainnet
cost. A sustained run still needs alerting and a reviewed signer-backed relayer
with a daily gas budget and a tested emergency stop.

## Completed 24-hour synthetic soak

Run ID `vps-24h-soak-20260923` completed on 24 September 2026. The test used
synthetic receipts only and did not prepare, sign, or submit an on-chain
transaction.

- Pace: 0.18 receipts/second.
- Duration: 86,383 seconds (23 hours, 59 minutes).
- Accepted: 15,550; failed: 0.
- Queue before/after: 2,162 / 17,712 retained records.
- Latency: 3.606 ms p50, 24.673 ms p95, 840.428 ms maximum.
- Queue stop threshold/capacity: 19,000 / 20,000 records.
- Report: `/var/lib/aichain-base-sepolia-ingress/reports/vps-24h-soak-20260923.json`.

The transient systemd launch failed because its installed runner rejected the
fractional rate; a separate load-generator process completed the run and wrote
the report. The load outcome validates continuous synthetic ingress acceptance
and queue retention, but does not validate systemd supervision of the generator
or the 11.57 receipts/second average needed for one million receipts per day.
The queue is still populated, so preserve this state and do not add load until a
separate queue-reset/rotation plan is agreed. A higher-depth restart recovery
check remains useful before the queue is rotated.

That higher-depth recovery check passed on 24 September 2026: immediately before
and after restarting `aichain-base-sepolia-synthetic-ingress.service`, health
reported 17,712 queued and retained records, with zero rejected or failed
records. The indexer service remained active during the ingress restart.
