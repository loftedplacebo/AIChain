# Phase 2C EVM Verifier Evidence

| Field | Value |
| --- | --- |
| Status | Interoperability trial complete; no production stack selected |
| Evidence date | 2026-08-29 |
| Statement | ZK-001 policy evaluation `0.1.0-draft` |
| Fixture | `fixtures/zk/policy-evaluation-v0.1.0-draft.json` |
| Chain | Disposable Anvil `31337`, bound to `127.0.0.1:9545` |
| Host | 12-vCPU AMD EPYC virtual machine, 47 GiB RAM |

## Result

RISC Zero and SP1 each generated a real Groth16 proof, independently verified it in the host, exported it for EVM use, and passed the matching official Solidity verifier on a disposable chain. Both guests committed byte-for-byte identical 714-byte JSON public values and the same AVR receipt ID:

`0xde239d25bc76016b92256da94013ca347646522ea4faf7fbe57e22c6ec42b316`

This closes the prototype interoperability gate. It does not close ZK-002 or select a production proof stack.

## Version pins

| Component | Pin |
| --- | --- |
| RISC Zero SDK | `risc0-zkvm 3.0.3` |
| RISC Zero EVM encoder | `risc0-ethereum-contracts 3.0.0` |
| RISC Zero verifier source | `risc0/risc0-ethereum` tag `v3.0.0`, commit `32aa0b6f` |
| SP1 SDK | `6.5.0` |
| SP1 embedded circuit | `v6.1.0` |
| SP1 verifier source | `succinctlabs/sp1-contracts` tag `v6.1.1`, commit `d3629729` |
| Foundry / Anvil | `1.7.1` |

The SP1 SDK package and circuit have different versions by design. The verifier was selected from the circuit version embedded by SP1 `6.5.0`, not by assuming package-version equality.

## Measurements

These are single-host feasibility measurements, not the repeated sample required by the Phase 2B benchmark plan.

| Measurement | RISC Zero | SP1 |
| --- | ---: | ---: |
| Groth16 proof/seal bytes | 260 | 356 |
| Shared public-value bytes | 714 | 714 |
| First accepted proof elapsed | 149.230 s | 1,692.686 s |
| Instrumented warm proof elapsed | 149.230 s | 475.035 s |
| Instrumented wrapper wall time | 151.39 s | 502.94 s |
| Maximum RSS | 4,799,064 KiB | 19,060,372 KiB |
| EVM verification gas used | 250,152 | 263,715 |
| EVM verification gas estimate | 256,152 | 269,910 |
| Verifier deployment gas | 1,258,873 | 2,634,905 |
| Verifier runtime bytecode | 5,313 bytes | 11,974 bytes |

The candidate-reported proof elapsed excludes the preceding cold Rust release compilation. Wrapper wall time includes host setup, proof generation, independent native verification, export, and process overhead. The warm SP1 proof also passed the deployed Solidity verifier; its gas estimate was 269,922, a 12-gas calldata-content variation from the accepted first proof's estimate.

## Positive evidence

| Stack | Verifier | Verification transaction | Result |
| --- | --- | --- | --- |
| RISC Zero | `RiscZeroGroth16Verifier` `v3.0.0` | `0x2d878865d88f768dfd5969675a5b3f2a6a558085f034f1d2817df60b1e7b6f4c` | Success |
| SP1 | `SP1VerifierGroth16` circuit `v6.1.0` | `0xd51ed66b57a851ce147399026f78f25225f044d9f51ef7f48057904a8c7d9e38` | Success |

Addresses and transaction hashes belong only to the disposable local chain and are evidence identifiers, not production deployments.

## Negative evidence

| Stack | Altered proof | Wrong program/image | Altered public values/journal | Result |
| --- | --- | --- | --- | --- |
| RISC Zero | Rejected | Rejected | Rejected | Pass |
| SP1 | Rejected | Rejected | Rejected | Pass |

The mutations were checked to differ from the valid value before submission. Each negative call reverted in the Solidity verifier.

## Interpretation

On this one workload and host, RISC Zero produced a smaller proof, proved materially faster, used less memory, and required slightly less verification gas and verifier bytecode. That is strong evidence for continued RISC Zero evaluation, but it is not enough to select it for production. Release stability, audit coverage, trusted-setup assumptions, verifier governance, upgrade safety, aggregation, operational tooling, and repeated measurements may change the engineering conclusion.

## Remaining decision gate

Before ZK-002 can close:

1. execute the Phase 2B five-warm-up and ten-measured-proof protocol on controlled hardware;
2. record median, p95, minimum, maximum, and exact peak memory for both candidates;
3. review trusted-setup and verifier-upgrade assumptions;
4. complete assurance and privacy review for the frozen public encoding;
5. define whether aggregation is in or out of the first release under ZK-003; and
6. record the stack decision and rationale in the architecture decision log.

Halo2 remains deferred under the existing feasibility decision. This evidence does not reject it.
