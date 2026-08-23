# ADR-0003: EVM-Native PoW Header Compatibility

| Field | Value |
|---|---|
| Status | Accepted for Phase 2A candidate selection |
| Date | 2026-08-23 |
| Decision ID | L1-001 selection criteria; L1-002 protocol-change boundary |
| Scope | Phase 2A candidate evaluation only |

## Context

AIChain is building an independent EVM/Core-Geth L1. The C1 KawPoW boundary
can derive a candidate verifier commitment from the existing Core-Geth header,
but its pinned source has an unfavourable maintenance posture. The C2 FiroPoW
verifier is actively maintained and passes source-vector controls, yet its
canonical source hashes a different, Bitcoin-style serialized header and uses
a compact target format.

Importing Firo's header model or silently converting Core-Geth fields into it
would create unreviewed AIChain consensus rules. Keeping both header models
would weaken EVM tooling compatibility and add upgrade complexity.

## Decision

Adopt the following as a **selection criterion**, not an algorithm selection:

1. AIChain will retain one EVM/Core-Geth-derived canonical block-header model.
2. A launch PoW candidate must map from a versioned pre-seal commitment of
   that header and preserve an explicit, independently testable nonce, proof,
   height, difficulty, and boundary rule.
3. AIChain will not import another network's full header serialization,
   compact-target encoding, network parameters, or activation rules merely to
   reuse its PoW implementation.
4. A candidate that requires an AIChain-native mapping is eligible only after
   its full mapping specification, independent vectors, security review,
   upgrade path, and test implementation are approved. It is not eligible
   merely because its standalone hash/vector verifier works.
5. Header-model compatibility is a first-class Phase 2A comparison factor
   alongside GPU accessibility, CPU validation cost, maintenance, security,
   ASIC/FPGA exposure, and quantum-agility posture.

## Consequences

### Positive

- Standard EVM headers, tools, explorers, and JSON-RPC remain the base
  compatibility surface.
- Consensus review can focus on one header model and one upgrade path.
- A candidate adapter becomes auditable as a narrow mapping plus verifier,
  rather than a hidden import of foreign chain semantics.

### Costs and Risks

- Mature GPU PoW algorithms derived from non-EVM networks may be rejected or
  require substantial specification and audit work.
- C2 FiroPoW cannot progress from CPU-control status without a separate
  AIChain-native mapping decision and vectors.
- C1's existing mapping does not solve its source-maintenance concern.
- This criterion alone does not decide the final algorithm or make any
  quantum-resistance claim.

## Options Considered

| Option | Disposition |
|---|---|
| Preserve one EVM-native header and require explicit candidate mapping | **Proposed** |
| Import an external candidate chain's header and difficulty model | Reject for AIChain Phase 2A; materially changes the agreed EVM tooling direction |
| Maintain two header forms | Reject; creates ambiguity and additional consensus/upgrade attack surface |
| Create a custom mapping immediately | Defer; it must follow a selected candidate, an approved specification, vectors, and review |

## Not Decided by This ADR

- L1-001 final PoW algorithm, source revision, or mining implementation.
- Block interval, difficulty adjustment, gas limit, supply, rewards, and
  genesis configuration.
- Whether C1, C2, C3, or a newly screened candidate will become the shortlist
  leader.
- A post-quantum account/signature migration.

## What This Does Not Decide

This ADR does not close L1-001. A final L1-001 ADR must additionally include
candidate benchmarks, attack analysis, a quantum-threat assessment, exact
consensus rules, GPU/NVIDIA/AMD measurements, and an activation/rollback plan.

## Acceptance Record

Accepted by the AIChain project on 2026-08-23: retain EVM compatibility as a
mandatory PoW candidate-selection criterion while keeping the final mining
algorithm undecided.

## References

- [PoW Header and Target Mapping Contract](../phase-2a-pow-header-target-mapping-contract.md)
- [C2 FiroPoW Header-Mapping Review](../phase-2a-c2-firopow-header-mapping-review.md)
- [C1 Source Audit](../phase-2a-c1-source-audit.md)
- [Phase 2A Consensus Recommendation](../phase-2a-consensus-recommendation.md)
