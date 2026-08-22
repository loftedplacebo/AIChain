# ADR-0002: Organisational Verification Ledger Default

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-08-22 |
| Decision owners | AIChain project |
| Related decisions | ARCH-002, AVR-008, AVR-009, PRIV-002, SCALE-003, CRYPTO-001 |
| Related research | [Future-Proof Organisational Verification Architecture](../future-proof-organisational-verification-architecture.md) |

## Context

Enterprise and autonomous-machine users need private evidence storage, internal policy and authority views, controlled disclosure, retention, and auditability. AIChain also needs a common neutral verification surface and a scalable public anchoring path.

## Decision

AIChain will treat an **Organisational Verification Ledger (OVL)** with AIChain public anchoring as the default enterprise deployment model.

An OVL is an append-only receipt and evidence service inside an organisation's chosen security boundary. It creates sequence-linked Merkle checkpoints and anchors their roots to AIChain. A verifier can combine a checkpoint, a Merkle inclusion proof, the L1 anchor, and authorised private evidence to assess a claim.

The following design directions are accepted:

- Keep one neutral public AIChain L1; do not make a customer-specific private L1 the initial product.
- Use profile-based, versioned receipt, credential/delegation, attestation, and checkpoint objects rather than a separate schema per domain.
- Keep private evidence off-chain by default; public anchors carry commitments and the minimal checkpoint metadata needed for verification.
- Use a hierarchy of leaf receipt → Merkle batch → signed checkpoint → L1 anchor; individual L1 receipts remain an exception path.
- Present assurance as distinct evidence dimensions instead of a generic “verified” label.
- Require crypto-suite identifiers, key rotation, re-signing/migration records, and versioned verification reports in the first stable OVL formats.
- Prioritise enterprise-agent governance and C2PA-reference content provenance as the first profile candidates.

## Consequences

The first implementation is a local development-only reference service and CLI. It will reuse the existing `ReceiptBatchAnchor` contract, but this does not select the final contract, signature suite, private storage, identity model, checkpoint schema, or public API.

A later shared verification domain or permissioned/consortium deployment may be evaluated where multiple organisations need independently operated replicas of the same case log. That is separate from the OVL default and requires its own governance, membership, availability, and dispute design.

An L1 anchor demonstrates inclusion of a submitted checkpoint; it does not prove that all relevant organisation events were submitted. High-risk profiles must define anti-omission controls such as sequence rules, sealing cadence, monitoring, or independent witnesses.

## Open Work

- Canonical OVL schema, key and identity model, signature suite, and storage/access/retention model.
- Checkpoint cadence, batching limits, replay and reorganisation handling.
- Disclosure-bundle and auditor-verifier formats.
- Shared verification domain and private-ledger deployment evaluation.
- Post-quantum/hybrid signature evaluation and migration path.

