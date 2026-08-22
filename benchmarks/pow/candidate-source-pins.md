# Phase 2A Candidate Source Pins

| Field | Value |
|---|---|
| Status | Reproducibility record — not an endorsement or selection |
| Retrieved | 2026-08-22 |

These pins identify the first upstream materials to inspect during the CPU-side C1/C2 integration work. They do not authorise copying a licence-incompatible implementation or modifying the Core-Geth submodule.

| Candidate | Role | Upstream | Pinned commit | Next verification |
|---|---|---|---|---|
| C1: ProgPoW/KawPoW family | Mining/tooling reference | [RavenCommunity/kawpowminer](https://github.com/RavenCommunity/kawpowminer) | `632f6ea0a5cd09e2c6443374dbe6db0a767715ba` | Confirm licence, build provenance, and candidate-independent test vectors. |
| C1: ProgPoW/KawPoW family | Core C/C++ algorithm reference | [DNS/kawpow](https://github.com/DNS/kawpow) | `4b08dc2becc1d879728ea41bc4925d8f051a453e` | Identify authoritative valid/invalid vectors; assess Go binding or clean-room implementation feasibility. |
| C2: Autolykos v2 | Protocol implementation reference | [ergoplatform/ergo](https://github.com/ergoplatform/ergo) | `c313356950fe69ef406c2ee031204079a05ea7d7` | Identify exact Autolykos v2 implementation/specification and test vectors; assess Core-Geth integration delta. |

## Pin discipline

- A benchmark run must record one immutable upstream revision, not `main`, `HEAD`, or a release label alone.
- Test vectors, licence terms, and local adaptation commits must be captured before code enters the AIChain source tree.
- A source update creates a new candidate revision and must be rerun or explicitly justified; it may not silently replace an earlier result.
- The actual source examined for a production candidate will be vendored or referenced according to its verified licence and the project’s contribution policy, both **TBD**.
