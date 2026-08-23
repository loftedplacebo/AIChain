# Phase 2A EVM-Compatibility Gate Review

| Field | Value |
|---|---|
| Status | Complete historical gate — ADR-0004 subsequently authorised bounded C1 engine work |
| Version | 0.3 |
| Last updated | 2026-08-23 |
| Governing decision | [ADR-0003](./decisions/0003-evm-native-pow-header-compatibility.md) |
| L1-001 status | **KawPoW selected for Phase 2A development only; production selection remains TBD** |

## Result

Applying ADR-0003 to the current candidate set produces **no engine-ready
candidate**. This is a useful Phase 2A result: it prevents a premature
consensus implementation based on a source or header model that does not meet
the accepted EVM compatibility rule.

## Subsequent Decision

[ADR-0004](decisions/0004-kawpow-phase-2a-development-selection.md) later
selected C1 KawPoW as the lowest-maintenance Phase 2A development path. It
accepted the explicit bounded-height migration strategy and authorised only a
disabled engine wrapper with strict regression gates. It did not make KawPoW a
production algorithm or authorise miner, genesis, RPC, or shared-devnet
activation.

## Candidate Disposition

| Candidate | GPU orientation | EVM/Core-Geth header fit | Source posture | Outcome |
|---|---|---|---|---|
| C0 Ethash | Historic GPU-oriented control | Direct | Core-Geth development baseline | Keep as devnet control only; not a launch candidate due to known ASIC history |
| C1 KawPoW | GPU-targeted | Demonstrated isolated Core-Geth pre-seal mapping | Pinned `cpp-kawpow` source is 2020 and has no current canonical 64-bit API | Advanced only under ADR-0004 to a disabled engine spike; not production eligible |
| C2 FiroPoW | GPU-targeted | Does not directly fit: hashes Firo's Bitcoin-style header and compact target | Official source active | CPU verifier control only; no Core-Geth mapping without a separate AIChain-native profile decision |
| C3 Autolykos v2 | GPU-memory-hard | Different header/client model | Official source active | Not a Phase 2A engine candidate |
| EIP-1057 / ProgPoW source check | Designed for Ethereum-style PoW | Conceptually aligned | The standard is marked stagnant; current `chfast/ethash` at `17e80309…` (2025-06-08) exposes Ethash but no ProgPoW API | Not a maintained off-the-shelf implementation candidate |
| C4 Quai KawPoW source lead | GPU-oriented KawPoW implementation | A generic `headerHash + nonce + uint64 height` verifier entry is closer to the EVM envelope, but is not yet an AIChain mapping | Active Go source, but the host repository is GPL-3.0 with mixed file provenance and Quai-specific PoEM/merged-mining assumptions | Source lead only; no code reuse, dependency, or engine work authorised |

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

## Path B Expanded-Screen Result — C4 Quai KawPoW

The screen located an actively maintained KawPoW implementation in the official
Quai Go node source, pinned at
`208b67554a9078086c8de7c9ab0a9b5af2d9d567` (2026-08-19). Its exposed
`VerifyKawpowShare(headerHash, nonce, blockNumber)` boundary and internal
`uint64` block-height handling are materially closer to ADR-0003's
single-header envelope than C2's foreign serialized header model. The source
also includes real-block and deterministic behaviour tests.

It is **not** an AIChain integration candidate yet:

- Quai's overall protocol uses PoEM, multi-algorithm/merged-mining paths, and
  its own work-object/header rules; AIChain must not inherit any of those
  consensus rules.
- The host repository is GPL-3.0 and individual KawPoW files carry mixed
  provenance/headers. No source may be copied, imported, or linked until a
  licence and dependency-boundary review says exactly what is permissible.
- Its tests establish behaviour within Quai's protocol context, not a
  completed AIChain header-mapping or independent conformance proof.

Therefore C4 is recorded as a **source lead only**. The only authorised next
investigation is a read-only provenance/licence review and independent
comparison against publicly available KawPoW vectors. That work must not
import Quai source into Core-Geth or change the devnet.

## Evidence References

- [EIP-1057: ProgPoW](https://eips.ethereum.org/EIPS/eip-1057) — marked
  stagnant, but defines the Ethereum-oriented algorithm and test vectors.
- [EIP-1057 test vectors](https://eips.ethereum.org/assets/eip-1057/test-vectors).
- [`chfast/ethash`](https://github.com/chfast/ethash) — audited at
  `17e80309ceb592b9b5175b831549a1cc160d1a08` (2025-06-08); current public
  API/source review found Ethash rather than an exported ProgPoW API.
- [C1 source audit](./phase-2a-c1-source-audit.md) and
  [C2 mapping review](./phase-2a-c2-firopow-header-mapping-review.md).
- [C4 Quai KawPoW source screen](./phase-2a-c4-quai-kawpow-source-screen.md).

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.2 | 2026-08-23 | Recorded the completed expanded screen and historical no-engine result |
| 0.3 | 2026-08-23 | Reconciled the historical gate with ADR-0004's bounded C1 engine authorisation |
