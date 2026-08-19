# Identity and Authority Prototype

| Field | Value |
|---|---|
| Status | Phase 1B prototype specification |
| Document version | 0.1 |
| Last updated | 2026-08-19 |
| Contract | `AuthorityRegistry` |
| Protocol status | Non-final; does not resolve identity or authorization decisions |
| Companion documents | [Autonomous Machines Product Vision](./autonomous-machines-product-vision.md); [AI Verification & ZK Architecture](./ai-verification-and-zk-architecture.md) |

## 1. Purpose and Boundary

This prototype tests an on-chain reference model for an organisation-controlled agent wallet and a time-bounded, opaque authority commitment. It is designed to support later receipt profiles where a verifier can ask whether a particular wallet was actively delegated by a registered controller at a given time.

It does **not** prove a legal entity, person, machine, model, real-world employer, safety certification, policy compliance, or the correctness of a delegated action. Registering an organisation ID merely associates an opaque identifier with the EVM account that first registered it on this prototype contract.

## 2. Data Model

```text
Organisation ID (opaque bytes32)
        │ controller wallet
        ▼
Agent wallet ── authority commitment ── validity window ── revocation state
```

| Record | On-chain fields | Meaning |
|---|---|---|
| Organisation | `organizationId`, `controller`, `registeredAt` | A controller-wallet claim over an opaque identifier |
| Delegation | `organizationId`, `agent`, `authorityCommitment`, `validAfter`, `validUntil`, `revokedAt` | A time-bounded delegation from that controller to an agent wallet |

`authorityCommitment` is an opaque `bytes32` reference. It can later bind a versioned authority, configuration, policy, approval, credential, or disclosure package, but this prototype does not define its canonical encoding or storage location.

## 3. Contract Behavior

| Function | Caller | Result |
|---|---|---|
| `registerOrganization` | Any EVM account | Registers an unused non-zero organisation ID and sets the caller as controller |
| `authorizeAgent` | Current controller | Creates or replaces an agent delegation with non-zero commitment and an explicit validity window |
| `revokeAgent` | Current controller | Marks an existing delegation revoked at the current chain time |
| `getOrganization` / `getDelegation` | Anyone | Returns registered data or reverts for an unknown record |
| `isActive` | Anyone | Returns whether a delegation is present, unrevoked, and within its current chain-time validity window |

Re-authorizing an agent replaces its prior delegation and clears its previous revocation state. There is no controller transfer, recovery process, multi-signature control, credential issuer, or upgrade authority in this prototype.

## 4. Receipt Relationship

A future receipt profile may include references such as:

```json
{
  "identity": {
    "organizationId": "0x<bytes32>",
    "agent": "0x<agent wallet>",
    "authorityCommitment": "0x<bytes32>"
  }
}
```

That shape is illustrative only. It is not added to the current `0.1.0-draft` AVR fixture or anchor contract. A verifier must also specify which time applies—claimed execution time, submission time, or inclusion time—before treating a delegation as applicable to a receipt.

## 5. Security and Assurance Limits

- The controller key is the sole authority in this prototype; compromise can create, replace, or revoke delegations.
- Chain time bounds are enforced only according to block timestamps and do not prove an off-chain action occurred within the window.
- The registry does not bind an agent wallet to the receipt submitter, receipt attestation signer, or real-world agent identity.
- An opaque commitment is not confidential by itself when it represents predictable data; final hiding and canonicalization rules are **TBD**.
- Revocation affects the registry's current state. Historical interpretation of a receipt needs a defined state-at-time or event-history rule, which is **TBD**.
- The contract is unaudited development code and is not suitable for production identity or authorization decisions.

## 6. Open Decisions

| ID | Prototype contribution | Still unresolved |
|---|---|---|
| ID-001 | Tests EVM-wallet references for organisations and agents | DID/credential/machine/model identity format, issuer trust, and real-world binding |
| ID-002 | Tests controller delegation, expiry, and explicit revocation events | Delegation semantics, multi-party control, recovery, credential issuance, and historical revocation rules |
| ID-003 | Tests opaque authority commitments | Canonical authority/configuration/policy format, disclosure, storage, and verification |
| AVR-004 | Demonstrates a possible relationship between issuer wallets and authority data | Final signature, authorization, and trust model |

## 7. Upgrade Path

This prototype follows the same replacement-and-migration principle as `AVRAnchor`: later versions may deploy a new registry and explicitly reference predecessor records. No proxy or hidden administrator is introduced. Selecting a production upgrade or governance model remains **TBD**.

## 8. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-19 | Initial authority-registry prototype boundary |
