# SP1 ZK-001 Prototype

This is a Phase 2C evaluation spike, not an approved production verifier. The guest recomputes the ZK-001 public bindings from the private witness and fails if they differ from the shared fixture.

## Intended execution

With the SP1 toolchain installed, run from this directory:

```text
cargo run --release -p aichain-sp1-policy-evaluation-script -- ../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json
```

The first milestone is guest execution and exact golden-vector agreement. Generating a cryptographic proof, exporting a Solidity verifier, gas measurement, and negative proof-verification tests are subsequent milestones. Do not describe output from this spike as an on-chain ZK proof yet.
