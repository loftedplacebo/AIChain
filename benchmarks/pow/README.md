# Phase 2A PoW Benchmark Artefacts

This directory is the reproducibility boundary for Phase 2A. It contains no selected consensus algorithm and must not be used to change the shared devnet.

For each candidate run:

1. Copy `manifest.template.json` to a timestamped, candidate-specific manifest under `benchmarks/pow/runs/`.
2. Fill every field from the actual machine, build, topology, workload, and measurement method.
3. Store only non-secret inputs and outputs. Never place private keys, RPC credentials, or `.env` values here.
4. Link the manifest, raw measurements, code revision, and any Core-Geth patch in the comparison report.

The initial benchmark protocol is in [the Phase 2A shortlist](../../docs/phase-2a-pow-candidate-shortlist.md).

