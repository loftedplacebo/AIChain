# ZK-004: Verifier Governance and Resource Specification

| Field | Value |
| --- | --- |
| Status | Alpha implementation accepted; external review required for public release |
| Registry | `AVRProofVerifierRegistry` |
| RISC adapter | `RiscZeroAVRProofVerifierAdapter` |
| Version | `0.1.0-draft` |

## Components

| Component | Responsibility | Change path |
| --- | --- | --- |
| Official RISC Zero verifier | Cryptographically verifies a seal/image/journal digest | Pin a released upstream version |
| AIChain adapter | Pins the upstream verifier and guest image ID | Deploy a new immutable adapter |
| Version registry | Schedules, activates, caps, pauses, retires, and records proof/journal digests | New append-only version only |
| SDK/auditor | Parses verified JSON journal and joins it to AVR/proof-batch data | Versioned software release |

## Enforced policy

- Owner and guardian cannot be the same address.
- Activation delay cannot be below 48 hours.
- Version IDs cannot be replaced or reactivated after retirement.
- Proof/journal bytes cannot exceed 4,096 each; initial deployment caps are
  1,024 and 2,048 respectively.
- A duplicate version/journal digest record is rejected.
- Guardian pause and emergency retirement stop new acceptance without deleting
  historical records.

## Assurance boundary

The adapter proves the exact JSON journal was produced by the pinned RISC Zero
guest. Because the current journal is JSON, the registry records its digest
rather than attempting Solidity field extraction. An auditor must verify the
proof, parse the journal, recompute its digest, and check the AVR/proof-batch
receipt binding. This is a deliberate safe boundary, not a missing proof.

## Validation

The disposable Foundry suite has five passing tests covering lifecycle,
resource limits, duplicate/tamper rejection, guardian controls, role/delay
constraints, and RISC image/journal pinning. Real verifier gas is measured in
[Phase 2C EVM Verifier Evidence](./phase-2c-evm-verifier-evidence.md); mock
registry gas is not a production cost estimate.
