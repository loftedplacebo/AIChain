# ZK-001 Threat Model

| Field | Value |
|---|---|
| Status | Initial Phase 2B review |
| Statement | Policy evaluation `0.1.0-draft` |
| Last updated | 2026-08-28 |

## Assets and Trust Boundary

Protected assets are the privacy of the action, policy, configuration, and reason codes; the integrity of the public decision and AVR binding; and the verifier's availability. The prover and receipt submitter may be malicious. The selected proof system, generated verifier, chain consensus, and correctly configured verifier registry will become trusted components and require separate review.

## Threats and Required Controls

| Threat | Current control | Remaining work |
|---|---|---|
| Fabricated witness or result | Proof must execute the exact deterministic program; result commitment and decision are public inputs | Validate with each real proof stack and audit the circuit/program |
| Receipt/public-input substitution | Receipt ID, root, issuer, organisation, authority, timestamp, result, statement, and program are bound publicly | Negative proof tests and on-chain calldata tests |
| Cross-version replay | Statement and program commitments are public inputs; AVR derivation is version-domain-separated | Verifier registry must reject unsupported versions |
| Cross-receipt replay | Exact receipt ID and commitments root are public inputs | Aggregation must preserve per-receipt inclusion bindings |
| Guessing low-entropy private values | Independent 32-byte blindings precede canonical values in commitments | Secure randomness, secret handling, and rotation guidance |
| Blinding reuse | Separate domains and four fixture blindings | SDK must generate fresh independent blindings and detect accidental reuse where practical |
| Malformed/ambiguous encoding | Exact shapes, integer bounds, lowercase bytes32, sorted unique arrays, canonical JSON | Fuzz all implementations and circuit boundary conversions |
| False authority/provenance inference | Documentation states organisation and authority are bindings only | UI/API must not label these properties “verified” without separate checks |
| Timestamp overclaim | Timestamp is explicitly described as claimed | Compose with inclusion-time and trusted-time evidence where required |
| Model/provider overclaim | Commitments are opaque and unopened | Separate provenance statements or attestations |
| Verifier upgrade attack | Program commitment is explicit | Governance, allowlist, timelock, rollback, and historical-verifier policy under ZK-004 |
| Unsound or compromised proof stack | No stack selected | Security maturity review, independent audit, pinned reproducible toolchains |
| Prover side channels | Not addressed by semantic reference | Benchmark and document memory, logs, crash artifacts, and hardware isolation |
| Verification/proving denial of service | Narrow bounded statement and fixed input shape | Measure gas, cap proof/input sizes, queue/rate-limit proving and submission |
| Witness/evidence loss | Chain stores commitments, not recovery data | Organisation storage, retention, access, and disclosure policy under PRIV-001 |
| Quantum degradation | SHA-256 draft commitments retain substantial preimage security but are not a complete PQ migration strategy | Crypto-agile suite IDs and migration design under CRYPTO-001 |

## Acceptance Tests

Every candidate must reject altered action, policy, configuration, decision/result, receipt ID, commitments root, identity/authority binding, timestamp, statement ID, program commitment, malformed proof, and wrong verifier version. Fuzzing and generated-verifier review remain mandatory before any production claim.

## Residual Risk

The reference programs test semantic agreement only; they are not zero-knowledge proofs. Until a candidate prover and verifier pass the benchmark, negative vectors, privacy review, and security review, no receipt may be described as ZK-proved by this project.

