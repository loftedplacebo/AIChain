# ADR-0006: RISC Zero Initial Proof-Stack Selection

| Field | Value |
| --- | --- |
| Status | Accepted for the initial AIChain proof implementation |
| Date | 2026-09-06 |
| Decision ID | ZK-002 |
| Scope | AVR ZK-001 proof generation and EVM verification; not a mainnet activation |

## Context

AIChain requires an off-chain proof system capable of proving the versioned
ZK-001 private policy-evaluation statement and verifying the resulting proof
through an EVM contract. RISC Zero and SP1 both passed the native proof,
public-input binding, hostile substitution, and disposable EVM verifier gates.
Halo2 remains deferred because a bespoke circuit is not proportionate for the
first zkVM-based statement.

The five-warm-up, ten-measurement benchmark on the same host showed a material
RISC Zero advantage for this workload: 152.920-second median proving time,
about 4.6 GiB median peak RSS, and a 260-byte proof, compared with SP1's
433.613 seconds, about 17.5 GiB, and 356 bytes. RISC Zero also had lower
measured EVM verification gas in the prior interoperability trial.

## Decision

1. **RISC Zero is selected for the initial AIChain AVR ZK proof path.**
2. The initial selected versions are `risc0-zkvm 3.0.3`, the versioned ZK-001
   statement, and the pinned RISC Zero EVM verifier source/encoder documented
   in [Phase 2C EVM Verifier Evidence](../phase-2c-evm-verifier-evidence.md).
3. Proof generation remains off-chain. Only the proof and defined public
   inputs/commitments are verified on-chain; private witness data is not
   submitted to the L1.
4. SP1 remains a tested alternative, not a required runtime component. Halo2
   remains deferred, not rejected for every future specialised proof.

## Why

RISC Zero is the smallest and fastest evaluated path that passed the same
functional and negative-verification gates. Its substantially lower measured
memory footprint matters for prover availability and operational cost; its
smaller proof and lower measured EVM verification cost help the L1 path.

This is an engineering selection for the initial versioned claim, not a claim
that RISC Zero is universally best or permanently immutable.

## Explicitly not decided

- **ZK-003:** resolved subsequently by ADR-0007 for alpha: individual proofs
  and proof-aware Merkle batches; recursive aggregation remains deferred.
- **ZK-004:** the production verifier ownership, upgrade authority, timelock,
  emergency response, audit acceptance criteria, gas/resource caps, and
  migration process remain TBD. A disposable EVM deployment is evidence, not
  a production verifier deployment.
- Production receipt schema, commitment hiding/salting rules, identity and
  authority semantics, proof-service deployment, and data-availability model
  remain separately versioned decisions.
- A future RISC Zero version change, cryptographic-suite change, or alternate
  proof stack requires fresh compatibility, security, performance, and
  migration evidence; it is not a silent dependency update.

## Required release gates

Before a public or production network relies on this path:

1. complete independent security review of the ZK-001 statement, guest,
   host binding, verifier integration, and public-input encoding;
2. specify verifier ownership, upgrade/migration controls, pause/emergency
   behavior, version coexistence, and audit trail under ZK-004;
3. define individual-proof resource limits and complete the deferred
   recursion/aggregation benchmark, queue/load, and failure/retry work before
   any aggregate-proof release;
4. repeat the benchmark on the intended production-class prover environment;
5. validate any pinned dependency/version update against all positive and
   negative vectors and the EVM verifier; and
6. ensure receipt assurance presentation says precisely what ZK-001 proves.

## References

- [Repeated benchmark results](../phase-2c-repeated-benchmark-results.md)
- [Phase 2C EVM verifier evidence](../phase-2c-evm-verifier-evidence.md)
- [ZK-001 policy-evaluation statement](../zk-001-policy-evaluation-statement.md)
- [ZK-001 threat model](../zk-001-threat-model.md)
- [ADR-0005: ZK-001 policy-evaluation statement](./0005-zk-001-policy-evaluation-statement.md)
