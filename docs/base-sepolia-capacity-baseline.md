# Base Sepolia synthetic capacity baseline

Status: completed on 21 September 2026. These are controlled synthetic-only
testnet results. They demonstrate commitment, proof, and local ingress
behaviour; they are not a production throughput guarantee or a mainnet cost
forecast.

## Confirmed batch anchors

| Receipts | Transaction | Gas used | Merkle proof depth | Execution fee (wei) |
| ---: | --- | ---: | ---: | ---: |
| 100 | `0xa3cb60f6ce88c43b0ba51281db6a426d27076b033fe0c662145c4b79aa58b17b` | 211,636 | 7 | 1,269,816,211,636 |
| 1,000 | `0x94bcbd0157424d75c779cc508e17a5ee443e494405b3d9c03b5927f1faf46613` | 211,648 | 10 | 1,269,888,211,648 |
| 5,000 | `0x6f076aa185b9a57903b4ddce3c665f7069c29f32a48bb885df54ece31f7dade9` | 211,660 | 13 | 1,269,960,211,660 |
| 10,000 | `0xc1505ee94e698d6a1ddd50e665f2d1099c7803aa1ef77cb87a85db21fc99aeea` | 211,672 | 14 | 1,270,032,211,672 |

Every batch emitted the expected publisher-scoped `ReceiptBatchAnchoredV2`
event from `0x5781540E4682A9D35011C94A25F615e438E8E7aF`. Each audit regenerated
the Merkle root from its immutable prepared manifest and used the deployed
contract to verify first, middle, and final membership proofs.

The 10,000-receipt anchor used only 36 more gas than the 100-receipt anchor.
That is expected: the contract receives one root, a count, and the schema
version, while individual receipt commitments and proofs stay in the
permissioned evidence store.

## Ingress durability baseline

The ingress service now appends every accepted receipt to a local NDJSON
journal and checkpoints the full queue every 100 accepted receipts. Startup
replays only journal events newer than the checkpoint. The queue test covers
recovery of an uncheckpointed journal entry.

The first journaled 5,000-receipt benchmark completed with no rejected or
failed submissions:

| Metric | Result |
| --- | ---: |
| Elapsed time | 55.28 seconds |
| Throughput | 90.45 receipts/second |
| Submission latency p50 | 9.63 ms |
| Submission latency p95 | 13.35 ms |
| Maximum observed submission latency | 518.96 ms |

The local benchmark is single-client, synthetic, and loopback-only. It does
not measure WAN latency, production database capacity, relayer behaviour,
Base congestion, or hostile traffic.

## VPS-originated staged rehearsal before local installation

On 22 September 2026, the Python load generator first ran on the VPS against a
fresh synthetic-only ingress instance through a temporary encrypted reverse
SSH tunnel. At that point the service remained on the development workstation
because Node.js was not yet installed on the VPS. This measures the caller path and
end-to-end acceptance over the tunnel, not service capacity on the VPS.

| Stage | Duration | Requested rate |
| --- | ---: | ---: |
| 1 | 60 seconds | 1 receipt/second |
| 2 | 60 seconds | 10 receipts/second |
| 3 | 60 seconds | 25 receipts/second |

All 2,160 expected synthetic receipts were accepted. There were zero failed
submissions, the queue finished at 2,160/2,800 stop threshold, and no anchor
was prepared or broadcast. End-to-end latency was 160.9 ms p50, 333.8 ms p95,
and 609.5 ms maximum. Restarting the isolated ingress process after the run
restored all 2,160 queued receipts with zero rejected or failed records. The
aggregate rate of 12 receipts/second includes the
three deliberately different stages and is not a capacity estimate. The
machine-readable report is
[`vps-origin-stage-20260922.json`](../build/base-sepolia/vps-load-runs/vps-origin-stage-20260922.json)
in ignored build output.

## VPS-local staged rehearsal

The synthetic ingress was subsequently installed as an isolated systemd
service on the VPS. Node.js `v24.21.0` LTS was placed under the AIChain
toolchain directory after verifying the official SHA-256 checksum. The service
runs as an unprivileged account and listens only on `127.0.0.1:8787`.

The VPS-local run repeated the 1, 10, and 25 receipts/second stages for 60
seconds each. It accepted 2,162 receipts with zero failures, at 3.176 ms p50,
17.614 ms p95, and 135.241 ms maximum. No on-chain transaction was prepared or
sent. A systemd restart restored all 2,162 queued records. Installation and
operating details are in
[the VPS ingress installation record](vps-base-sepolia-synthetic-ingress.md).

## Scale interpretation

One million receipts per day is an average ingress rate of 11.57
receipts/second. With 10,000 receipts per anchor, it would produce about 100
Base anchor transactions each day. The maximum batch wait time remains the
customer-visible latency control: batches should be published when either the
count ceiling or the wait ceiling is reached.

## Follow-up implementation status

- The synthetic ingress now uses an append-only journal with 100-receipt
  checkpoints and tested replay after restart.
- A capped Base Sepolia relayer policy module is implemented with default
  pause, injected signer, dry-run quotes, calldata checks, fee caps, hourly
  transaction caps, daily spend reservations, and serialized submissions.
- The Python synthetic load runner supports paced rate stages, queue stop
  thresholds, latency reports, and health snapshots. It does not anchor.

## Gates before the 24-hour VPS run

1. Replace the local journal with the selected production durable store and
   run restore tests against process interruption.
2. Connect the relayer to a reviewed signing service. The local policy module
   is not yet connected to an HSM/KMS and its JSON budget file is not suitable
   for multi-process production use.
3. Add sustained-run alerting for ingress acceptance, queue depth, checkpoint
   duration, batch age,
   anchor confirmation time, relayer failures, RPC retries, CPU, memory, disk,
   and gas spend.
4. Before a 24-hour run, repeat a longer staged VPS rehearsal at 1, then 10,
   then 25 receipts/second and confirm clean recovery after each restart. See
   [the relayer and load runbook](base-sepolia-relayer-load-runbook.md).
