# Phase 2D AVR Presentation Alpha

| Field | Value |
|---|---|
| Status | Implemented alpha interface; not a final protocol schema |
| Presentation schema | `aichain.avr-presentation` / `0.3.0-alpha` |
| Compatibility | Additive wrapper around AVR `0.1.0-draft` and authorised AVR `0.2.0-draft` |
| On-chain impact | None in this milestone |
| Last updated | 2026-09-06 |

## Purpose

Applications need a single, portable answer to: *which receipt is this, what
evidence is being presented, and where was it anchored?* The earlier receipt
schemas intentionally cover only receipt derivation and specific authority
flows. This alpha presentation supplies an application-facing envelope without
changing either receipt identifier, any deployed anchor contract, or Ethereum
JSON-RPC behaviour.

It must not be described as proving that an AI output is true, that a model
reasoned correctly, or that a provider ran a model. It binds and presents the
specified evidence only.

## Shape

```text
AVR receipt (existing, canonical)
       |
       +-- receiptId + commitmentsRoot (re-derived and checked)
       |
       +-- assurance evidence (explicit level)
       |
       +-- optional public anchor location
       v
AVR Presentation 0.3.0-alpha (canonical, portable application object)
```

The exact fields are:

```json
{
  "schema": "aichain.avr-presentation",
  "schemaVersion": "0.3.0-alpha",
  "receipt": { "existing canonical AVR receipt": "…" },
  "receiptId": "0x…",
  "commitmentsRoot": "0x…",
  "assurance": { "level": "commitment-only" },
  "anchor": null
}
```

`receiptId` and `commitmentsRoot` are never trusted merely because they are
presented: both SDKs re-derive them from the embedded receipt before accepting
the presentation. The separately derived `presentationId` is domain-separated
(`aichain:avr-presentation:0.3.0-alpha:`). It is an application identifier;
it is not a replacement for the underlying AVR receipt ID and is not yet a
contract field.

## Assurance levels

| Level | Required evidence | What it establishes | What it does not establish |
|---|---|---|---|
| `commitment-only` | Canonical receipt commitments | The committed receipt data can be identified | Who endorsed it or whether its AI claim is true |
| `issuer-attested` | EIP-191 signer and 65-byte signature | An issuer signature is supplied for the receipt flow | Authority, provider execution, or output truth |
| `organisation-authorised` | Existing `aichain.authorised-avr` receipt | The receipt uses the existing organisation/authority commitment profile | Current on-chain delegation unless queried at a specified chain point |
| `zk-proved` | RISC Zero program, public-values, proof commitments and verification mode | A proof reference is explicitly bound into the presentation | More than the versioned ZK-001 statement; see [ZK-001](./zk-001-policy-evaluation-statement.md) |

`zk-proved` supports the selected alpha proof system only: `risc0`. Its
`verification` field is either `individually-verified` or `batch-claim`.
`batch-claim` is a statement about the alpha batch path, not an assertion that
recursive proof aggregation is live; that remains deliberately deferred.

## Anchor location

An optional `anchor` records `mode` (`individual` or `batch`), `chainId`,
contract address, and transaction hash. It is a location hint for a client or
indexer. This first alpha does not claim confirmation/finality from the mere
presence of that object. A later work package will query the node, validate
the appropriate event and inclusion path, and define confirmations, retry and
reorganisation semantics.

## Privacy boundary

The envelope contains commitments and public references only. Raw prompts,
outputs, credentials, proofs and off-chain organisational data remain outside
the presentation unless separately disclosed by an authorised application
flow. The alpha schema does not create a private chain or separate private
consensus protocol.

## SDK status and verification

Matching reference implementations are available in:

- `sdk/typescript/avr-presentation.js`
- `sdk/python/avr_presentation.py`

The test suites assert receipt-identifier preservation, canonical presentation
derivation, all supported assurance paths, and rejection of substituted receipt
identifiers, invalid anchors, missing ZK references, and inappropriate
authority claims. The shared commitment-only vector derives presentation ID:

```text
0x07c328d358d4a86455ee6b27d2a91a7ef10ebf252a6f89fc2f0b29b83e0ab6d3
```

## Deliberately open work

- Formal schema governance and a stable semver release.
- Verification of EIP-191 signature recovery in this presentation helper.
- Node/indexer-backed anchor-event and confirmation validation.
- Batch manifests, data availability, inclusion proofs, retry and reorg policy.
- Versioned AI JSON-RPC methods and rate/fee/backpressure controls.
- Blockscout receipt/proof views and organisation disclosure UX.
- Independent security review before any public-facing integration.
