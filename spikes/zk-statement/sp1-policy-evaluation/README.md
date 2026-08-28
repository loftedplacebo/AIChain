# SP1 ZK-001 Prototype

This is a Phase 2C evaluation spike, not an approved production verifier. The guest recomputes the ZK-001 public bindings from the private witness and fails if they differ from the shared fixture.

## Intended execution

With the SP1 toolchain installed, run from this directory:

```text
cargo run --release -p aichain-sp1-policy-evaluation-script -- --execute ../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json
```

To generate and independently verify a proof off-chain:

```text
cargo run --release -p aichain-sp1-policy-evaluation-script -- --prove ../../../fixtures/zk/policy-evaluation-v0.1.0-draft.json
```

Exporting a Solidity verifier, gas measurement, and EVM negative-verification tests remain subsequent milestones. Do not describe output from this spike as an on-chain ZK proof yet.
