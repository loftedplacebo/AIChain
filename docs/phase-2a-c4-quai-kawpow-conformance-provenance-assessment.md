# Phase 2A C4 — KawPoW Conformance and Provenance Assessment

| Field | Value |
|---|---|
| Status | Complete — C4 remains source lead only |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Candidate | C4 — Quai KawPoW |
| Governing decision | [ADR-0003](./decisions/0003-evm-native-pow-header-compatibility.md) |
| L1-001 status | **TBD — no mining algorithm selected** |

## Purpose

Establish whether the C4 source lead can clear any additional Phase 2A gate
without importing its code. The assessment is deliberately read-only:
no Quai source was copied, linked, imported, vendored, or run on the AIChain
development network.

## Materials and Revisions

| Material | Revision / result |
|---|---|
| Quai source examined | `dominant-strategies/go-quai@208b67554a9078086c8de7c9ab0a9b5af2d9d567` |
| AIChain independent reference | Apache-2.0 `RavenCommunity/cpp-kawpow@061d341011ca341e1f506c52b571f5fd64a0df71` |
| Independent reference vector run | **Passed**: 13 ProgPoW vectors using `run-c1-kawpow-vector-check.ps1` |
| Quai package test run | **Not runnable on this Windows host**; setup failed before tests due to the upstream `ltcd/secp256k1_ltc` dependency having no files for the host build constraints |

The failed upstream test invocation is a reproducible dependency-boundary
finding, not a failure of a KawPoW vector.

## Input-Shape Review

| Question | Finding | Meaning |
|---|---|---|
| Does C4 expose a generic verifier shape? | Yes: `VerifyKawpowShare(headerHash, nonce, blockNumber)` | Closer to an EVM-header adapter than C2's foreign serialized-header path |
| Is height handled as 64-bit in the lower-level function? | Yes | Avoids C1's immediate signed-32-bit C API boundary, but does not itself define AIChain's long-term consensus policy |
| Does the source contain test vectors? | Yes: real Ravencoin block inputs including header hash, nonce, height, and expected mix hash | Useful for future independent comparison, but they are source-local evidence pending an executable neutral harness |
| Is an EVM/Core-Geth mapping proved? | No | The precise pre-seal hash, byte order, target comparison, mix field, and nonce semantics still require a versioned AIChain specification and public vectors |

## Provenance and Reuse Boundary

The top-level Quai repository is GPL-3.0. The inspected KawPoW area includes
files with Apache-2.0 and LGPL-3.0 provenance headers, while the package imports
Quai-specific consensus, type, logging, and dependency paths. A file header
alone is not a sufficient clearance to copy or link the code.

**Decision:** treat the C4 source exclusively as documentation and behavioural
evidence. No code reuse is authorised. Any future implementation path needs a
separate licence review covering the exact files, transitive dependencies,
linking model, notices, and AIChain's intended distribution.

## Execution Finding

AIChain's independently pinned, Apache-2.0 KawPoW control passed all 13
published ProgPoW vectors. In contrast, the upstream Quai KawPoW package could
not reach its tests in the assessment host because the package imports a wider
Quai/Litecoin dependency graph that lacks the required Windows build files.

This does not demonstrate an algorithm defect. It demonstrates that C4 is not
a small, platform-neutral verifier dependency that AIChain can adopt
off-the-shelf. It reinforces the existing no-import rule.

## Final Disposition

C4 clears **none** of the remaining engine-entry requirements:

- no independent, executable cross-implementation result on the same vector
  corpus;
- no accepted EVM/Core-Geth header mapping;
- no licence/dependency clearance;
- no CPU/GPU performance, mining, or ASIC-resistance evaluation specific to
  AIChain.

It remains a maintained source lead under Path B. The current Ethash devnet and
all consensus choices remain unchanged.

## Next Safe Work

1. Locate a separately licensed, platform-neutral KawPoW verifier that can
   consume public vectors without importing a foreign node.
2. If one exists, define an explicit candidate adapter from the Core-Geth
   pre-seal header and compare its output with public vectors.
3. Only after reproducibility and licence gates pass, decide whether an
   EIP-1057/ProgPoW implementation ownership proposal is justified.

## Evidence References

- [C4 source screen](./phase-2a-c4-quai-kawpow-source-screen.md).
- [C1 source audit](./phase-2a-c1-source-audit.md).
- [EIP-1057: ProgPoW](https://eips.ethereum.org/EIPS/eip-1057).
