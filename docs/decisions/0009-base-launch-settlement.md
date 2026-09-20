# ADR-0009: Base settlement for the verification-product launch

| Field | Decision |
|---|---|
| Status | Accepted architectural direction by the founder on 20 September 2026; implementation and production release gates open |
| Scope | Launch the verification product as an application on Base; evaluate larger/hierarchical receipt batching |
| Supersedes | Own-PoW launch dependency in the original development plan; no change to historical experiment results |
| Preserves | Existing signed receipt semantics, historical verification, accepted proof-stack decisions and component provenance |

## Decision

1. Use Base as the intended launch settlement network. Start deployment validation on Base Sepolia. Orvessian is an application on Base, not a new L2/L3, private chain or validator network.
2. Reuse the AIChain engineering repository and current contract/SDK/specification paths. Keep the independently versioned website repository in place. No new protocol fork or repository clone is required for this decision.
3. Evaluate larger flat batches before hierarchical batches. Batch hierarchy requires versioned manifests and end-to-end proof support; it is not recursive ZK proof aggregation. No implementation or capacity claim is implied by this decision.
4. Stop scheduling new mining, difficulty, ASIC, own-L1 economics and public mining-testnet work as launch dependencies. Preserve source and evidence. Actual miner shutdown and provider cancellation require exact target identification and evidence retention; this ADR does not assert that either has happened.
5. Launch through production-grade Base RPC access with independent fallback/observation. A self-hosted Base deriving node is optional, with a separate operating case; there is no launch requirement to run our own mining or consensus network.
6. No own token is required for launch. Wallet design follows the repository/roadmap review, with separate deployer/admin and limited-balance transaction-submission roles. No wallet or key is created by this ADR.
7. Preserve website design and deployment. Record narrowly scoped inaccurate technical claims for a later content correction, without a redesign or automatic publication.

## Invariants and release gates

- Existing context-bound receipts retain their original chain and contract. Never rewrite signatures or backdate an anchor when changing destinations.
- Customer receipt author and gas-paying submitter remain distinct.
- Accepted work and proof material must survive process failure; exports must support independent verification without our API.
- Base inclusion, data finality and any stronger proof/settlement check must be separately stated. Block-count thresholds from the PoW prototype do not establish Base finality.
- Public anchor semantics, destination binding, Base deployment compatibility, retention, operational recovery and independent security review remain open launch gates.
- RISC Zero ZK-001 remains a narrow policy-evaluation proof under ADR-0006–0008. General receipt anchoring does not imply model execution proof or automatically extend the old proof statement to all general profiles.

## Consequences

The primary engineering effort moves to the verification service, reliable submission, batching, finality observation and auditor exports. Existing node/miner work becomes a preserved research track. New own-chain work requires a separately justified decision rather than automatic continuation after the Base launch.

The implementation sequence and evidence are recorded in [the Base transition audit and roadmap](../base-transition-audit-and-roadmap.md). This decision approves the architectural pivot, not a production deployment, cloud resource deletion, public release, final pricing or token issuance.
