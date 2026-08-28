# Next Development Phases

| Field | Value |
|---|---|
| Status | Active delivery roadmap |
| Document version | 0.1 |
| Last updated | 2026-08-28 |
| Starting point | Phase 1 complete; NVIDIA KawPoW/ASERT development validation complete |
| Current constraint | No AMD GPU or additional independent GPU miners available |
| Principle | Continue software/product work now; move hardware-diversity and multi-miner tests to the testnet gates |

## 1. Immediate Direction

The next active phase is **Phase 2B: ZK statement and stack evaluation**. It can proceed on the laptop and VPS without another mining GPU and without changing the selected development consensus profile.

The following tasks are deferred—not waived—to the closed/public-testnet programme:

- AMD/OpenCL miner interoperability;
- three or more independently operated GPU miners;
- geographic propagation, stale/orphan, and pool-distribution measurements;
- heterogeneous NVIDIA/AMD fork and recovery tests; and
- production hash-rate bootstrap and launch-difficulty validation.

Until those tests pass, KawPoW plus 10-second/30-minute ASERT remains the **development baseline**, not a final mainnet selection.

## 2. Phase 2B — Define the First ZK Claim

**Objective:** decide exactly what the first useful proof establishes before selecting a proof system.

Recommended first claim:

> A committed AVR action and committed policy/configuration were evaluated by a versioned deterministic verification program, producing the committed result.

This deliberately does not claim that a frontier model reasoned correctly, that an AI output is true, or that a named provider executed the model unless separate trusted evidence supports that statement.

### Deliverables

1. Versioned proof statement and explicit non-claims.
2. Public-input schema binding:
   - receipt identifier;
   - commitments root;
   - policy/configuration commitment;
   - verification-program/version commitment;
   - result commitment; and
   - optional organisation/disclosure-domain commitment.
3. Private-witness definition and privacy review.
4. Deterministic reference verification program.
5. Positive, tampered, substituted, wrong-version, and replay test vectors.
6. Threat model covering prover dishonesty, public-input substitution, verifier upgrades, and information leakage.

### Exit gate

- **ZK-001** is recorded.
- The claim can be explained in plain language without overstating what is proved.
- Go, Python, and TypeScript fixtures agree on the committed inputs.

## 3. Phase 2C — ZK Stack Evaluation and Prototype

**Objective:** compare candidate stacks against the agreed claim using the same program and fixtures.

### Candidates

- RISC Zero;
- SP1; and
- Halo2 where its circuit model is appropriate.

These remain evaluation candidates, not settled choices.

### Measurements

- proving time and peak memory;
- proof size;
- on-chain verification gas;
- recursion/aggregation support;
- toolchain and audit maturity;
- verifier upgrade model;
- failure/retry and proof-queue behavior; and
- integration effort for Go, Python, TypeScript, Solidity, and the AVR workflow.

### Deliverables

1. Reproducible prototype for each viable candidate.
2. One Solidity verifier deployed on a disposable local chain.
3. Receipt-to-proof binding and negative substitution tests.
4. Benchmark report and recommended stack.
5. Explicit decision on whether aggregation is included in the alpha or deferred.

### Exit gate

- **ZK-002–004** are resolved to alpha scope.
- A valid proof verifies on-chain and all required negative vectors fail.

## 4. Phase 2D — AVR Product and Scale Foundation

**Objective:** turn the existing receipt/authority prototypes into stable alpha interfaces while ZK evaluation proceeds.

### Work packages

- AVR schema consolidation and canonical serialization.
- Assurance levels that clearly distinguish commitment-only, attested, authority-backed, and ZK-proved receipts.
- Python and TypeScript SDK parity.
- Versioned AI JSON-RPC draft without breaking standard Ethereum RPC.
- Blockscout receipt/proof indexing and display.
- Organisation/private-ledger view based on encrypted off-chain data plus public L1 commitments, not a separate private consensus protocol at this stage.
- Batch manifest, data-availability, inclusion-proof, retry, and reorganization semantics.
- Queueing, backpressure, fee estimation, and batch-size policy.

### Exit gate

- One external application can create, sign, batch, anchor, query, disclose, and verify a receipt using documented SDK interfaces.
- Private raw AI data is not required on-chain.
- Individual versus batched throughput and state-growth costs are measured.

## 5. Phase 3 — Integrated Alpha

**Objective:** combine the L1, AVR, SDKs, organisation view, explorer, and first proof path into one reproducible internal release.

### Target product slice

```text
AI/agent execution (off-chain)
        |
        v
AVR SDK -> commitment + signature/authority evidence
        |
        +----> optional ZK prover/aggregation queue
        |
        v
Batch/individual anchor -> AIChain L1
        |
        +----> Blockscout/public verification view
        |
        +----> authorised organisation disclosure view
```

### Required alpha demonstrations

- unproved and proved AVR submission;
- individual and batched anchoring;
- proof/public-input substitution rejection;
- organisation-scoped disclosure package;
- MetaMask/Foundry compatibility;
- explorer lookup by receipt, transaction, issuer, and batch; and
- restart, reorg, indexer-resync, and duplicate-submission recovery.

## 6. Phase 4 — Closed Testnet

**Objective:** run the integrated alpha as a controlled multi-operator network and close the deferred hardware/consensus gates.

### Deferred mining tests required here

- AMD/OpenCL build, mine, verify, and recovery test.
- At least three independently operated GPU miners.
- At least two geographic regions and heterogeneous network latency.
- NVIDIA/AMD competing branches and greater-work reorganization.
- Stale/orphan rate, propagation, confirmation, and pool concentration measurements.
- Hash-rate entry/exit shocks and launch-difficulty calibration.
- Extended partition, restart, catch-up, and soak tests.
- Quantum-threat assessment and upgrade/migration posture.

### Wider closed-testnet work

- proof spam and verifier-cost limits;
- sustained receipt/batch/proof load;
- monitoring and incident response;
- upgrade/rollback rehearsals;
- security review; and
- testnet economics, fees, mining rewards, and supply invariants.

The final PoW and production network/economic parameters remain **TBD** until these gates pass.

## 7. Phase 5 — Public Testnet

**Objective:** validate open mining, node operation, SDK integrations, proofs, indexing, and support processes outside the core development environment.

### Required outcomes

- public node/miner releases and reproducible builds;
- public faucet and explicitly valueless test currency;
- explorer, SDK, AVR, batch, and ZK integration guides;
- capacity and confirmation report based on observed traffic;
- public upgrade/reset policy; and
- external security assessment and remediation.

## 8. Asset, Stablecoin, and Bridge Track

The native AIChain coin is required for gas and mining rewards, but its issuance and economics remain **TBD**.

A stablecoin is not currently a settled core-protocol component. The lowest-risk sequence is:

1. Use valueless native test currency during closed/public testnets.
2. Prototype an ordinary EVM test stablecoin only for application and fee-flow testing.
3. Decide whether production needs:
   - a third-party issuer deploying natively;
   - a canonical bridged stablecoin;
   - multiple permissionless bridged assets; or
   - no protocol-endorsed stablecoin.
4. Do not operate a value-bearing bridge until consensus finality assumptions, confirmation policy, validator/miner distribution, upgrade authority, monitoring, pause/recovery behavior, and independent audits are defined.

Bridge confirmation rules must be materially stricter than ordinary AVR confirmation. No stablecoin or bridge design is selected by this roadmap.

## 9. Recommended Linear Order

1. Define ZK-001 proof statement and public inputs.
2. Build the deterministic verification program and shared negative vectors.
3. Benchmark RISC Zero, SP1, and Halo2 against that exact claim.
4. Select the alpha proof stack and deploy its disposable verifier.
5. Consolidate AVR schema/assurance levels and SDK parity.
6. Add proof-aware batching, Blockscout indexing, and organisation disclosure flow.
7. Produce the integrated alpha.
8. Prepare the closed testnet and acquire/rent the AMD plus independent GPU capacity required to close the deferred mining gates.
9. Run public testnet only after closed-testnet security, performance, and operational acceptance.
10. Evaluate any stablecoin/bridge only through the separately gated asset track.

## 10. Immediate Next Task

Create the **ZK-001 Proof Statement Specification** containing:

- the exact claim;
- public and private inputs;
- commitment/domain-separation rules;
- assurance boundary and non-claims;
- positive/negative fixtures; and
- benchmark acceptance criteria for RISC Zero, SP1, and Halo2.

This is the highest-value task that does not depend on additional mining hardware.

## 11. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-28 | Deferred hardware-diversity tests to testnet and mapped ZK, AVR, alpha, testnet, and asset phases |
