# Autonomous Machines Product Vision

| Field | Value |
|---|---|
| Status | Living product-direction document |
| Document version | 0.1 |
| Last updated | 2026-08-19 |
| Decision state | Product scope expanded; protocol choices remain **TBD** |
| Architecture inputs | [AI Verification & ZK Architecture](./ai-verification-and-zk-architecture.md); [Core L1 Architecture and Tooling](./core-l1-architecture-and-tooling.md) |

## 1. Positioning

The network is a **neutral verification and audit layer for autonomous AI**. Its long-term ambition is to become a **trust layer for autonomous machines**.

It does not run AI inference, robot control, vehicle autonomy, or other workloads on-chain. Those workloads and their private evidence remain off-chain. The network provides cryptographically verifiable evidence about identity, configuration, authority, policy, action, and historical integrity.

## 2. Core Problem

Autonomous systems are commonly audited through records controlled by their operator, provider, or manufacturer. As those systems gain authority over money, contracts, software, and physical environments, interested parties need a way to verify historical evidence without relying solely on a party's own database.

The network addresses this by anchoring cryptographic commitments, attestations, timestamps, and—where a precisely defined claim warrants it—ZK proofs. Anchoring makes later alteration or substitution of disclosed evidence detectable; it does not make every claimed fact true by itself.

## 3. Fundamental Primitive: Verification Receipt

The AI Verification Receipt (AVR) evolves into the general **Verification Receipt** primitive. AVR remains the initial product and schema family; a future protocol may define machine-specific receipt profiles without silently changing the AVR contract or assurance model.

```text
Identity + configuration + authority + policy + event/action + evidence commitments
                                  │
                                  ▼
                       signed / attested receipt
                                  │
             optional proof of a precisely defined claim
                                  │
                                  ▼
                         independent L1 anchor
```

At minimum, a receipt can bind an off-chain evidence package to an issuer and chain inclusion. Higher assurance requires a defined identity/trust model, an attestation, or a proof statement. A receipt must never be presented as proving AI correctness, factual truth, safety, or legal authorization unless the specific design establishes that claim.

## 4. Supported Product Domains

The same evidence model is intended to accommodate the following domains. These are target use cases, not commitments to a particular regulator, customer, safety certification, or proof capability.

| Domain | Example verification objective | Private evidence normally remains off-chain |
|---|---|---|
| Enterprise AI agents | Establish the model, configuration, policy, approvals, and action associated with a decision | Prompts, outputs, internal policies, customer data |
| Agent-to-agent commerce | Verify an agent's claimed identity and delegated authority before interaction | Commercial terms, credentials, internal limits |
| AI-generated content | Establish provenance of a generated artifact | Source content and the artifact where confidential |
| AI supply chains | Reconstruct the committed lineage of agents, models, tools, data sources, approvals, and actions | Full logs, data, and model inputs |
| Robotics | Anchor firmware, controller, safety-configuration, maintenance, and significant-event evidence | Telemetry, video, control logs |
| Autonomous vehicles | Preserve an evidence trail around software, policy, sensor, and incident data | Camera, LiDAR, GPS, vehicle telemetry |
| Drones and industrial machines | Verify machine identity, firmware, operational authority, and constrained actions | Routes, payload details, sensor streams |

## 5. Capability Evolution

### Stage 1 — Immutable receipt anchoring

Create signed or attested receipts, commit private evidence, and anchor receipt identifiers and timestamps. This is the active prototype direction.

### Stage 2 — Identity and configuration references

Introduce versioned references to organisations, agents, models, machines, approved configurations, policies, and authority delegations. Registry form, credential format, revocation, and governance are **TBD**.

### Stage 3 — Policy and authority attestations

Represent claims such as an approved configuration being active or a required approval existing. Initially these may be attestations; they do not imply a ZK proof.

### Stage 4 — Private policy proofs

Use ZK only where a versioned statement and public-input boundary can demonstrate a useful private claim—for example, that a confidential amount was within a committed authorized limit. Proving frontier LLM inference is explicitly out of the initial scope.

### Stage 5 — Aggregation and recursion

Evaluate aggregation and recursive proofs for high-volume receipts only after individual receipt/proof semantics, security, and costs are understood.

## 6. Strategic Technology Boundaries

- **Off-chain execution:** AI inference and physical-machine control remain off-chain.
- **Off-chain evidence:** prompts, outputs, weights, sensor streams, customer records, proprietary policies, credentials, and full logs should not be placed on-chain by default.
- **On-chain evidence:** commitments, references, signatures/attestations, chain timestamps, supported proof results, and small verification metadata may be anchored or verified on-chain.
- **Proof scope:** initial proofs focus on the wrapper around autonomous activity—identity, configuration, policy, authority, approval, and committed input/output evidence—not general proof that a frontier model's inference was correct.
- **Identity scope:** a “machine passport” is a product concept. Its identifier format, issuer trust, credential model, and revocation behavior are **TBD**.
- **DAG scope:** a DAG could be evaluated later for parallel receipt workloads, but the agreed architecture remains an independent Core-Geth-derived EVM Proof-of-Work L1. No DAG architecture is selected or implied by this vision.
- **Useful-work scope:** GPU proof generation and aggregation may become a valuable network workload. They are distinct from Sybil-resistant consensus; no useful-work mining design is selected.

## 7. Design Principles

- Verify activity rather than store activity.
- Make disclosed fields intentional and minimize public data.
- Separate commitments, attestations, and cryptographic proofs in every API and user interface.
- Version schemas, policy references, identity credentials, proof statements, and verifier interfaces.
- Support replacement contracts, explicit migrations, and versioned profiles; do not rely on a hidden upgrade authority.
- State assurance limits plainly, especially for safety, compliance, provenance, and authority claims.

## 8. New Open Decisions

| ID | Decision | Status |
|---|---|---|
| ID-001 | Identity model for organisations, agents, models, and machines | TBD |
| ID-002 | Credential issuance, delegation, authorization, and revocation model | TBD |
| ID-003 | Configuration, policy, and authority reference/registry model | TBD |
| AVR-007 | Receipt profiles for AI, content provenance, and autonomous machines | TBD |
| ZK-005 | Initial private policy/authority claims eligible for ZK evaluation | TBD |
| SCALE-001 | Receipt batching, aggregation, recursion, and throughput strategy | TBD |
| CONS-001 | Whether useful verification work can ever participate in incentives without weakening consensus security | TBD |
| ARCH-001 | Whether a DAG or other parallel data architecture merits evaluation beyond the agreed L1 | TBD; no selection |

## 9. Maintenance Rules

- This document sets product direction; it does not settle L1 consensus, protocol, schema, identity, or ZK choices.
- A new use-case profile must specify its receipt fields, assurance claims, privacy boundary, threat model, and verification method before implementation.
- Update the companion architecture and development-plan documents whenever a product direction changes a concrete scope, dependency, or decision gate.

## 10. Change Log

| Version | Date | Change | Reference |
|---|---|---|---|
| 0.1 | 2026-08-19 | Initial product vision covering autonomous AI and machines | Product direction |
