# Phase 3 — Integrated internal alpha

Version: 0.1.0-alpha · Updated: 2026-09-07

## Scope and status

The remaining release gates are tracked in [Phase 3 sign-off](./phase3-signoff-tracker.md).

The receipt-to-proof-to-lookup internal slice is implemented and has passed a
complete fresh, bounded Linux reproduction, including the mixed workload.
This does not close every broader release gate in the development plan.

This profile uses **Core-Geth `--dev` with one-second simulated development
blocks**, not KawPoW mining. It does not change the operational Ethash devnet,
consensus decisions, token economics, stablecoin or bridge plans.

```text
Synthetic agent action + private policy/configuration witness
    ├─ unproved receipt → authorised anchor
    └─ RISC Zero proof → pinned verifier → bound receipt presentation
                     ↓
          bounded ingress → batch root transaction
                     ↓
        durable event index + inclusion manifest
                     ↓
        loopback AI RPC → Blockscout-compatible lookup
```

## Acceptance coverage

- Fresh funded agent, organisation registration, delegation and revocation.
- Agent signature recovery and successful authorised individual anchors.
- Proved and unproved receipt presentations, checked by JavaScript and Python.
- Real RISC Zero Groth16 proof, independently pinned guest image, exact journal
  binding to the AVR, and official EVM verification through the adapter.
- Rejection of altered proof, journal, issuer, mismatched versions and revoked agents.
- Bounded ingestion, deduplication, micro-batching and real batch transactions.
- Merkle inclusion, durable index resume, organisation disclosure and actual
  local AI RPC request returning Blockscout-compatible references.
- Separate bounded mixed workload: 1,000 logical receipts, ten batches at
  concurrency two, a real-proof replay, index reconstruction and 1,000 lookups.

The proof establishes deterministic evaluation of a committed action against a
committed policy/configuration. It does **not** establish model execution,
model-output truth or real-world outcomes. These demos use synthetic actions.
Authority is checked separately at individual anchoring; a batch root does not
prove or authorise all its leaves. The proof is verified through the adapter
directly, not through the delayed production verifier-registry activation flow.

## Reproduce on Linux

Prerequisites: Node.js 24+, Python 3, Foundry, GNU timeout, built Core-Geth and
the pinned RISC Zero 3.0.3 policy-evaluation host with real proving dependencies.
Run `npm ci --ignore-scripts` in the source checkout first.

Use a trusted build of `spikes/zk-statement/risc0-policy-evaluation`. The accepted
guest image is pinned in `fixtures/zk/phase3-image-id.txt`; never copy an arbitrary
proof's self-reported image into that trust root.

The official `risc0-ethereum` checkout must be commit
`32aa0b6f23ddd02dd93fc71717667606e5c7db86`. Its verifier is compiled for
**Istanbul**, because the default Cancun artifact did not deploy on this node.

```bash
export CORE_GETH_BIN=/absolute/path/to/core-geth
export RISC0_ETHEREUM_DIR=/absolute/path/to/risc0-ethereum
export RISC0_HOST_BIN=/absolute/path/to/aichain-risc0-policy-evaluation-host
bash scripts/run-phase3-alpha.sh
```

The runner refuses an occupied port 18548, creates a unique ignored `devnet/`
directory, builds contracts, starts its own loopback node, generates a fresh proof,
then checks the complete internal slice. Each test stage has a timeout; the node
stops on script exit. Do not use operational wallets or the existing devnet.

Outputs include `report.json`, `load-report.json`, presentations, proof, disclosure,
explorer response, manifests and index snapshots. **`context.json` contains a
disposable private key; `witness.json` contains synthetic private inputs.** Keep
the run directory private and ignored. Only publish reviewed, non-secret reports.

Windows split mode: use `scripts/phase3-alpha.js prepare|verify` over a localhost
SSH tunnel on 18548, generating the proof on Linux between those steps.
`scripts/phase3-python-check.py` validates the resulting presentations with Python.

## Alpha bounds and recovery

- Ingress: 16 KiB per presentation, 10,000 retained IDs, batches ≤1,000,
  250 ms default micro-batch target, three attempts. Full retained state rejects
  new work. Reconcile and rotate explicitly; do not silently evict deduplication IDs.
- Queue acceptance is in-memory, **not durable acceptance**. Callers retain
  receipts until inclusion. Recovery callbacks are idempotent and stale results
  cannot overwrite a newer attempt.
- Local RPC: explicit CLI opt-in, loopback binding, Host/Origin checks, 16 active
  requests, 100 requests/second, 32 connections and a 15-second socket timeout.
- Proof binding: RISC Zero 3.0.3 / statement 0.1.0-draft, pinned image,
  260-byte seal, journal ≤2,048 bytes; schema/binding mismatches fail closed.
- Index: network/genesis/contracts binding, atomic snapshots, canonical-log
  checks and full replay on reorg. Rebuild legacy unbound indexes. One writer only.
- Explorer: indexed inclusion is not finality or independent proof verification.
  Proof references remain claims until the verifier checks them.

## Evidence and limitations

The first laptop/VPS run generated a real proof in **176,252 ms**; seal 260 bytes,
journal 714 bytes. On-chain adapter verification consumed **267,251 gas**.

Its 1,000-receipt smoke workload confirmed ten batches in 6,154 ms:
**1.625 batch transactions/s; 162.493 logical receipts/s**. Ingestion p95 was
0.038 ms, inclusion p95 1,388 ms, index construction 869 ms and 1,000 batch
lookups 4,420 ms. Index size was 89,027 bytes. These are single-node smoke
measurements, not saturation limits, durable-ingestion performance or KawPoW TPS.

The first clean reproduction passed the product checks but stalled during load
under `--dev.period 0`. It was stopped; the corrected runner uses one-second
development blocks and stage timeouts. Do not count the stalled load as passed.

The corrected 2026-09-07 reproduction **passed and exited successfully**. A fresh
proof took 212,631 ms; verification again cost 267,251 gas. Ten batches confirmed
in 4,687 ms: 2.134 batch transactions/s and 213.358 logical receipts/s. Inclusion
p95 was 1,128 ms; indexing took 262 ms and 1,000 lookups took 2,060 ms. The
88,676-byte index covered six blocks. Node.js 24.8.0 ran directly on the VPS in
this run, unlike the laptop/SSH run above; the numbers are not directly comparable.
See [reviewed evidence](./phase3-evidence-2026-09-07.json).
Regression suites: 48 JavaScript tests and 13 Python tests passed.

A five-minute sustained mixed run also passed. It submitted 32,080 logical
receipts through 320 batch transactions, 80 individual authorised anchors and
80 genuine proof-verification replays. The observed closed-loop rate was 106.9
logical receipts/s and 1.60 transactions/s; batch inclusion p95 was 1,041 ms.
The fresh durable-index rebuild took 16.75 seconds. This is a bounded,
single-node measurement: it establishes the tested operating point and recovery
path, not public-network or KawPoW capacity.

Broader release gates still require sustained mixed-load/state-growth/recovery
measurement, a GPU/KawPoW multi-peer product rerun, delayed verifier-registry
governance integration, installation without prebuilt prover/node prerequisites,
and public API/security review. No production-ready or full-release-complete
claim follows from this internal profile.

## Change log

- 0.1.0-alpha: integrated internal profile, real proof/receipt evidence, bounded
  workload, reproducible runner and binding/recovery safeguards.
