# Synthetic pilot capacity waves — 10 October 2026

The ten-design-partner target requires fourteen total project slots while four
operator-owned projects remain. This is a staged capacity plan for the hosted
`test` pilot, not a production load claim or approval to use customer data.

## Current measured boundary

- Four projects and four isolated workers are healthy; the live database and
  reconciler cap is five projects. One slot remains for the first partner.
- The dedicated Base Sepolia funder held 0.037978873999999813 test ETH after
  the 10 October top-up. Ten additional relayers need at least 0.0105 test ETH
  under the current 0.001 ETH target plus 0.00005 ETH transfer margin each.
  Publishing gas also spends test ETH; recheck before every wave.
- The 6 October simultaneous **two-project** synthetic run accepted and
  independently verified twenty receipts. The longest mined delay was 380
  seconds when a worker's ten-transaction hourly slot was consumed. The
  supervised limit remains eight new receipts per project per rolling hour,
  with confirmation and independent verification within thirty minutes.
- There is no measured four-, seven-, ten- or fourteen-project workload yet.
  `pilot-cohort-capacity.py` deliberately reports `throughputMeasured:false`.
- The operator selected the existing two-project measurement as the current
  baseline. The five-project cap stays in force; no four-project synthetic
  wave is scheduled merely to increase it.

## Advancement sequence

| Wave | Total projects after admission | Partner projects | Cap before admission | Evidence needed before the next cap change |
| --- | ---: | ---: | ---: | --- |
| First partner | 5 | 1 | 5 | One complete partner-owned synthetic onboarding and receipt; five of five workers, journals and backup covered. |
| Early cohort | 7 | 3 | Raise 5 to 7 only after the first wave passes | Concurrent partner submissions within the eight-per-hour envelope, every project independently verified, no unresolved backlog or failed worker. |
| Middle cohort | 10 | 6 | Raise 7 to 10 only after the early cohort passes | Repeat the same checks with six partner projects and a closed restore covering every journal. |
| Full cohort | 14 | 10 | Raise 10 to 14 only after the middle cohort passes | Repeat at ten partners and review operator support load before calling this a supported cohort. |

Use the bounded SDK runner and the verifier's `RUN_ID COUNT all` mode for a
project-wide synthetic wave; the verifier checks each registered signer,
receipt commitment, batch proof and Base Sepolia transaction independently.

Before each cap change, record the exact Git revisions, policy and database cap,
project and worker registry counts, wallet balance, verified backup marker,
runtime health, pending provision requests and prior cap. Keep the current
project cap when any inventory or health field fails. After a wave, record
accepted, duplicate, rejected and 429/5xx counts per project; submission to
signature and mined-evidence delay; maximum queue age and attempts; worker and
host resource headroom; relayer spend; and a coordinated B2 capture and closed
restore. Stop new submissions if evidence exceeds thirty minutes or a worker
becomes unavailable. Reconcile the affected durable job before resuming.

The database trigger and protected reconciler policy both enforce the cap;
change them together with a reviewed transaction and rollback record. No
automated cap increase is enabled. The read-only prerequisite command on the
VPS is:

```sh
python3 /opt/aichain/governance-pilot-db-setup/pilot-cohort-capacity.py
```

Its funding and structural result is not a throughput pass. The full cohort
remains gated on the first partner's actual synthetic workflow and subsequent
wave observations.
