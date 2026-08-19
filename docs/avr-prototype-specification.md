# AVR Prototype Specification

| Field | Value |
|---|---|
| Status | Phase 1B prototype specification |
| Document version | 0.3 |
| Last updated | 2026-08-19 |
| Receipt schema version | `0.1.0-draft` |
| Protocol status | Non-final; does not settle AVR protocol decisions |
| Companion design | [AI Verification & ZK Architecture](./ai-verification-and-zk-architecture.md) |

## 1. Purpose

This specification defines a minimal, privacy-first receipt format solely for the Phase 1B vertical slice. It proves that identical receipt inputs produce an identical identifier in the Python and TypeScript reference implementations, and that the identifier can be anchored by an EVM contract.

It is deliberately not the final AVR schema, commitment scheme, signature model, or ZK interface.

## 2. Prototype Receipt

```json
{
  "schema": "aichain.avr",
  "schemaVersion": "0.1.0-draft",
  "assuranceLevel": "unproved",
  "issuer": "0x<20-byte EVM address>",
  "execution": {
    "claimedAt": "<RFC 3339 UTC timestamp>"
  },
  "commitments": {
    "configuration": "0x<32-byte hash>",
    "input": "0x<32-byte hash>",
    "model": "0x<32-byte hash>",
    "output": "0x<32-byte hash>",
    "policy": "0x<32-byte hash>",
    "provider": "0x<32-byte hash>"
  }
}
```

All commitment values are opaque 32-byte values. The receipt contains no raw prompt, output, customer data, model identifier, provider name, configuration, or policy text.

## 3. Canonicalization and Identifier

1. Serialize the receipt as UTF-8 JSON with object keys sorted recursively, no whitespace, and the field set above.
2. Compute `receiptId = SHA-256("aichain:avr:0.1.0-draft:" || canonicalReceiptUtf8)`.
3. Compute `commitmentsRoot = SHA-256("aichain:avr:commitments:0.1.0-draft:" || canonicalCommitmentsUtf8)`.

The `SHA-256` construction is a **prototype convention only**. It does not choose the final commitment or receipt-ID construction. The on-chain anchor accepts opaque `bytes32` values so a future schema or contract can adopt a different construction without reinterpreting existing anchors.

## 4. On-Chain Anchor

`AVRAnchor` stores and emits:

- `receiptId` — opaque prototype identifier;
- `commitmentsRoot` — opaque root binding the commitment fields;
- `schemaVersion` — explicit schema marker;
- `issuer` — the EVM account that submits the anchor; and
- `includedAt` — chain inclusion time (`block.timestamp`).

The contract rejects an empty identifier/root and duplicate identifiers. It neither verifies an AI execution nor validates the claimed execution time, issuer authority, off-chain signature, or private artifacts. Those are separate AVR decisions.

## 5. Upgrade and Migration

The prototype is designed for replacement rather than mutable in-place semantics:

- Receipt fields and canonicalization are versioned.
- The anchor stores the submitted schema version.
- Later anchor contracts can be deployed with a new interface or hash construction.
- A later migration record may reference an earlier anchor contract, receipt identifier, and successor identifier.

No proxy, admin key, or upgrade authority is introduced in this prototype. Choosing an on-chain upgrade model remains **TBD**.

## 6. Test Fixture

The common fixture is at `fixtures/avr/receipt-v0.1.0-draft.json`. Python and TypeScript tests must derive the same receipt ID and commitments root, and must detect a changed committed value.

### 6.1 Retrieval and Local Verification

The Python and TypeScript prototypes expose `prepare_anchor` / `prepareAnchor`, which derive the exact `receiptId`, `commitmentsRoot`, and `schemaVersion` accepted by the contract from any prototype receipt. They also expose `verify_receipt_against_anchor` / `verifyReceiptAgainstAnchor`. Given a locally held receipt and a retrieved anchor, each implementation compares the derived receipt ID and commitments root plus the schema version and, where supplied, issuer address. A changed committed value must fail verification against the original anchor.

`scripts/read-sample-avr-anchor.sh` performs a read-only `getAnchor` call for the first sample receipt using localhost RPC. It does not require a password or sign a transaction.

`scripts/anchor-avr.sh path/to/receipt.json` derives anchor fields through the Python SDK and submits any prototype receipt using the encrypted VPS keystore. The contract records the signing account as issuer; applications must ensure this matches the receipt's claimed issuer whenever that claim is relied upon. This prototype does not yet enforce that relationship in the contract.

## 7. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-19 | Initial Phase 1B prototype specification |
| 0.2 | 2026-08-19 | Added local anchor-verification behavior and read-only retrieval workflow |
| 0.3 | 2026-08-19 | Added data-driven SDK anchor preparation and submission workflow |
