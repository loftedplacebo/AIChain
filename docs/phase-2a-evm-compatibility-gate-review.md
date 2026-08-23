# Phase 2A EVM-Compatibility Gate Review

| Field | Value |
|---|---|
| Status | Complete — no current candidate may advance to engine work |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Governing decision | [ADR-0003](./decisions/0003-evm-native-pow-header-compatibility.md) |
| L1-001 status | **TBD — no mining algorithm selected** |

## Result

Applying ADR-0003 to the current candidate set produces **no engine-ready
candidate**. This is a useful Phase 2A result: it prevents a premature
consensus implementation based on a source or header model that does not meet
the accepted EVM compatibility rule.

## Candidate Disposition

| Candidate | GPU orientation | EVM/Core-Geth header fit | Source posture | Outcome |
|---|---|---|---|---|
| C0 Ethash | Historic GPU-oriented control | Direct | Core-Geth development baseline | Keep as devnet control only; not a launch candidate due to known ASIC history |
| C1 KawPoW | GPU-targeted | Demonstrated isolated Core-Geth pre-seal mapping | Pinned `cpp-kawpow` source is 2020 and has no current canonical 64-bit API | CPU/header control only; cannot enter engine work without an explicit maintained-implementation decision |
| C2 FiroPoW | GPU-targeted | Does not directly fit: hashes Firo's Bitcoin-style header and compact target | Official source active | CPU verifier control only; no Core-Geth mapping without a separate AIChain-native profile decision |
| C3 Autolykos v2 | GPU-memory-hard | Different header/client model | Official source active | Not a Phase 2A engine candidate |
| EIP-1057 / ProgPoW source check | Designed for Ethereum-style PoW | Conceptually aligned | The standard is marked stagnant; current `chfast/ethash` at `17e80309…` (2025-06-08) exposes Ethash but no ProgPoW API | Not a maintained off-the-shelf implementation candidate |

## What This Does Not Mean

- It does not mean GPU-targeted PoW is rejected.
- It does not make Ethash a launch choice.
- It does not require a foreign header model.
- It does not authorise a custom cryptographic algorithm.

It means the project has not yet found an off-the-shelf implementation that
simultaneously satisfies GPU targeting, the accepted EVM-header rule,
reproducible vectors, maintainable source posture, and the bounded-height
migration policy.

## Decision Paths

### Path A — Own a standards-conforming EIP-1057/ProgPoW implementation

Implement and maintain an AIChain verifier from the public EIP-1057
specification and its test vectors, using the EVM-native header profile. This
would be an **implementation of a named published algorithm**, not a newly
invented hash function, but it would make AIChain responsible for source
maintenance, independent review, test-vector conformance, GPU miners, and the
bounded-height/upgrade design.

This path is technically most aligned with the EVM gate, but it is a material
security and maintenance commitment. It must not begin consensus-engine work
until a scoped implementation and audit plan is accepted.

### Path B — Expand the EVM-compatible candidate screen

Continue researching GPU-targeted candidates that already provide an EVM-header
mapping and maintained source. Keep C0/C1/C2 only as controls while this screen
runs. This is lower immediate implementation risk but may not find a better
candidate and delays GPU/miner benchmarking.

### Path C — Revisit ADR-0003

Permit a carefully specified AIChain-native mapping of an otherwise suitable
algorithm such as C2. This keeps an EVM header but requires a new commitment,
target, nonce, and mix-proof specification with independent vectors and review.
It is not recommended as the next step because the mapping would be an
AIChain-specific consensus design before the algorithm itself is selected.

## Recommendation

Take **Path A only if** the project is willing to own the security and long-term
maintenance burden of a standards-conforming EIP-1057/ProgPoW implementation.
Otherwise take **Path B** and keep the present candidates as well-instrumented
controls. Do not take Path C merely to unblock C2.

## Evidence References

- [EIP-1057: ProgPoW](https://eips.ethereum.org/EIPS/eip-1057) — marked
  stagnant, but defines the Ethereum-oriented algorithm and test vectors.
- [EIP-1057 test vectors](https://eips.ethereum.org/assets/eip-1057/test-vectors).
- [`chfast/ethash`](https://github.com/chfast/ethash) — audited at
  `17e80309ceb592b9b5175b831549a1cc160d1a08` (2025-06-08); current public
  API/source review found Ethash rather than an exported ProgPoW API.
- [C1 source audit](./phase-2a-c1-source-audit.md) and
  [C2 mapping review](./phase-2a-c2-firopow-header-mapping-review.md).

