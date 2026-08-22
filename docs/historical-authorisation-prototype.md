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

## Development deployment

Deploy the new registry first with the controller's encrypted development keystore:

```bash
cd /opt/aichain
bash ./scripts/deploy-historical-authority-registry.sh
```

Then deploy the matching anchor, substituting the new registry address:

```bash
cd /opt/aichain
REGISTRY_ADDRESS=0x<new-historical-registry> \
  bash ./scripts/deploy-historical-authorised-anchor.sh
```

Both scripts prompt privately for the controller password. They do not migrate the current registry, alter existing delegations, or expose a secret. Registering an organisation and its agent delegation in the new registry is a separate next development action.

For the synthetic development organisation and laptop agent, run:

```bash
cd /opt/aichain
REGISTRY_ADDRESS=0x<new-historical-registry> \
  bash ./scripts/bootstrap-historical-organisation.sh
```

It creates organisation state only in the new historical registry and appends epoch `0` for the laptop agent. It does not alter the earlier AuthorityRegistry.

## Validated development result

On 2026-08-22, the synthetic organisation and laptop agent were registered in `HistoricalAuthorityRegistry` at `0xDda59b071201C0e38DcBb7670b7a125d33c9b8D9`. The matching historical anchor is `0xfEBD6bbf90B1D9f9beDBF551EB098B32386FEeb2`.

| Field | Value |
|---|---|
| Organisation registration | block `28680`, transaction `0xe48f9820eb7eb1eed73af8a4887dc51940b5d6e64e6e60c41e7d531c65f20799` |
| Agent epoch `0` | block `28681`, transaction `0xcf332fe2a0bb17f7477bbfcf058f3265e031bb5e1e71bcb7834611759d40f2ec` |
| Historical receipt anchor | block `28687`, transaction `0x18152a768749260f25e3169403ddc99c18a3738786075f226ee1f28d1241659e` |
| Receipt ID | `0xa1d13edf701d07c6c86647b67c78c1aea8557fd450186afcff0ceef620b22b6e` |
| Stored authorisation check time | `1787426816` |

The historical anchor read-back matched the expected organisation, authority commitment, commitment root, issuer, and schema version. A separate `isAuthorisedAt` query against the historical registry returned `true` at the exact stored check time. This is the intended prototype proof of inclusion-time authorisation surviving later state changes; it does not yet demonstrate a later revocation test or establish off-chain execution-time authority.
