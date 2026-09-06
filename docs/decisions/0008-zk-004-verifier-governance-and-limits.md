# ADR-0008: ZK-004 Verifier Governance and Resource Limits

| Field | Value |
| --- | --- |
| Status | Accepted for alpha; independent review remains a public-release gate |
| Date | 2026-09-06 |
| Decision ID | ZK-004 |
| Scope | RISC Zero ZK-001 verifier lifecycle, resource envelope, and historical records |

## Decision

1. AIChain's alpha uses an immutable, non-proxy `AVRProofVerifierRegistry`.
   Version IDs are append-only: a version is scheduled, activated, and may be
   retired permanently; it is never replaced in place.
2. Every version records an adapter, statement ID, program commitment,
   activation timestamp, and proof/public-value byte caps. The contract
   enforces a **minimum 48-hour activation delay**.
3. Owner and emergency guardian are required to be different addresses. The
   owner is expected to be a documented multisig/timelock, transfers ownership
   through a two-step process, and may propose, retire, or unpause. The guardian
   may pause and immediately retire a version.
4. The alpha RISC Zero adapter pins an official RISC Zero verifier address and
   a guest image ID. It verifies the exact seal and SHA-256 digest of the exact
   public journal bytes before the registry records journal/proof digests.
5. The registry caps proof and public values at 4,096 bytes each. The intended
   initial RISC Zero deployment caps are 1,024 proof bytes and 2,048 journal
   bytes, unless a new scheduled version has fresh evidence and review.
6. Current ZK-001 public values are canonical JSON. The on-chain record is
   therefore the cryptographically verified journal digest, not Solidity-parsed
   receipt fields. SDK/auditor logic parses the journal and joins it to the AVR
   and ZK-003 proof-batch claim using matching digests.

## Lifecycle

```text
Propose immutable version → wait at least 48 hours → activate
        → verify exact proof/journal → record digests
        → planned or emergency permanent retirement
```

Historical digest records remain queryable after retirement, but retired
versions cannot accept new proof submissions.

## Evidence

Disposable Foundry tests cover delayed activation, version immutability, byte
caps, altered proof/journal rejection, duplicate rejection, pause, emergency
retirement, role separation, and the RISC adapter's image-ID/seal/journal pin.

The registry overhead tests use a mock cryptographic verifier. They do not
replace the real RISC Zero Groth16 gas evidence in
[Phase 2C EVM Verifier Evidence](../phase-2c-evm-verifier-evidence.md).

## Public-release gates

Before any public testnet or mainnet reliance, complete independent review of
the guest, adapter, registry, source pins, deployment config, upgrade/incident
runbook, and caps; then deploy and test the exact official verifier/image pair.
If Solidity must extract receipt fields directly, introduce a new ABI-encoded
statement version—never an ad-hoc JSON parser.

## References

- [ZK-004 governance specification](../zk-004-verifier-governance.md)
- [RISC Zero Ethereum contracts](https://github.com/risc0/risc0-ethereum)
- [RISC Zero operations guide](https://github.com/risc0/risc0-ethereum/blob/main/contracts/script/README.md)
