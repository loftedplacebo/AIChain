# Historical Authorisation Prototype

| Field | Value |
|---|---|
| Status | Development-only design and contract prototype |
| Version | `0.1.0-draft` |
| Last updated | 2026-08-22 |
| Supersedes | Nothing; the original `AuthorityRegistry` remains an earlier prototype |

## Purpose

`HistoricalAuthorityRegistry` keeps each delegation as an immutable epoch rather than replacing one mutable record. `HistoricalAuthorisedAVRAnchor` records the exact chain timestamp at which it checked authorisation. An auditor can later verify that the issuer/authority combination was valid **at that timestamp**, even after a later revocation.

```text
delegation epoch 0 ── valid window ── later revoked
        │
receipt included at T
        │
historical query: was (organisation, agent, authority) authorised at T?
```

## Semantics

- Every `authoriseAgent` call appends a delegation epoch.
- `revokeLatestAgentEpoch` timestamps the most recent unrevoked epoch; it does not erase history.
- `isAuthorisedAt` returns true only where the supplied time is within the epoch's validity window and precedes any revocation time.
- The historical anchor checks authorisation at its own `block.timestamp` and stores that timestamp as `authorisationCheckedAt`.

This establishes historical chain-state semantics for **inclusion-time authorisation**. It does not prove when an off-chain AI execution occurred, and it does not settle a policy for claimed execution time versus inclusion time.

## Boundaries

- This is a new versioned registry/anchor pair; existing contracts and receipts are unchanged.
- Queries scan an agent's historical epochs and are intended for off-chain/audit reads and prototype write checks, not unbounded production workloads.
- Controller recovery, multi-signature control, credential issuer trust, policy evaluation, and final revocation governance remain **TBD**.

