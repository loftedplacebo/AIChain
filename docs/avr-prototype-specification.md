# AVR Prototype Specification

| Field | Value |
|---|---|
| Status | Phase 1B prototype specification |
| Document version | 0.5 |
| Last updated | 2026-08-22 |
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

The machine-readable Phase 1B draft schema is [avr-v0.1.0-draft.schema.json](../spec/avr/avr-v0.1.0-draft.schema.json). It fixes this prototype's field shape so Python and TypeScript reject missing, malformed, unknown-version, or silently extended receipt payloads before identifier derivation. This validation is a **draft conformance boundary**, not a final AVR protocol decision.

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

## 6. Prototype Issuer Attestation

An optional, off-chain attestation sidecar may sign the derived receipt ID without changing it. The prototype message is the UTF-8 string:

```text
AIChain AVR v0.1.0-draft receipt: <receiptId>
```

The signer uses **EIP-191 personal-sign**. A sidecar contains its schema/version, receipt ID, claimed issuer address, message, signature scheme, and 65-byte signature. It is cryptographically verified by recovering/checking the claimed address against the original message.

The receipt derivation explicitly excludes `expected` test data and optional `attestation` data. This avoids a circular identifier dependency and keeps existing receipt IDs stable. The sidecar is not stored or verified by `AVRAnchor` in Phase 1B; the anchor continues to record the transaction sender as prototype issuer. Binding a signature, enforcing sender-to-receipt issuer equality, or selecting a final signature scheme remain **TBD**.

## 7. Test Fixture

The common fixture is at `fixtures/avr/receipt-v0.1.0-draft.json`. Python and TypeScript tests must derive the same receipt ID and commitments root, and must detect a changed committed value.

### 7.1 Retrieval and Local Verification

The Python and TypeScript prototypes expose `prepare_anchor` / `prepareAnchor`, which derive the exact `receiptId`, `commitmentsRoot`, and `schemaVersion` accepted by the contract from any prototype receipt. They also expose `verify_receipt_against_anchor` / `verifyReceiptAgainstAnchor`. Given a locally held receipt and a retrieved anchor, each implementation compares the derived receipt ID and commitments root plus the schema version and, where supplied, issuer address. A changed committed value must fail verification against the original anchor.

`scripts/read-sample-avr-anchor.sh` performs a read-only `getAnchor` call for the first sample receipt using localhost RPC. It does not require a password or sign a transaction.

`scripts/anchor-avr.sh path/to/receipt.json` derives anchor fields through the Python SDK and submits any prototype receipt using the encrypted VPS keystore. The contract records the signing account as issuer; applications must ensure this matches the receipt's claimed issuer whenever that claim is relied upon. This prototype does not yet enforce that relationship in the contract.

`scripts/sign-avr-attestation.sh path/to/receipt.json [output.json]` creates and verifies an EIP-191 signature sidecar using the same encrypted VPS keystore. It prompts privately for the password and refuses to overwrite an existing sidecar.

### 7.2 SDK-Style CLI and Read-Only Lifecycle Check

Both reference implementations expose a small JSON command-line interface around their existing derivation and anchor-verification helpers:

```bash
PYTHONPATH=sdk/python python3 sdk/python/avr_cli.py derive fixtures/avr/receipt-v0.1.0-draft.json
node sdk/typescript/avr-cli.js derive fixtures/avr/receipt-v0.1.0-draft.json
```

Each supports `derive`, `prepare-anchor`, and `verify-anchor`. The `verify-avr-lifecycle.sh` script derives the fixture, reads the deployed anchor using standard EVM RPC, normalizes the returned data, and verifies it with the Python reference implementation. It is read-only and requires no credential:

```bash
bash ./scripts/verify-avr-lifecycle.sh
```

The CLI and lifecycle check are developer tooling for the Phase 1B draft. They are not a public SDK release or a commitment to final JSON, RPC, wallet, or credential interfaces.

### 7.3 Laptop-Originated End-to-End Example

`receipt-v0.1.0-draft-laptop-e2e.json` is a synthetic fixture whose claimed issuer is the dedicated development account on the laptop. The local helper derives the anchor arguments using the TypeScript reference implementation, decrypts the **local** keystore, and submits through only the laptop's localhost RPC:

```powershell
cd C:\AIChain
npm run submit:laptop-avr -- `
  fixtures/avr/receipt-v0.1.0-draft-laptop-e2e.json `
  0x871252AE9E27BDf8265402a70A0Fb04B55b64dF7
```

After confirmation, use the reported transaction and `verify-avr-lifecycle.sh` on the VPS to confirm that the same receipt is retrieved and verified from the chain. This example is development-only; the key-management path, `ethers` usage, fixed contract address, and individual anchor transaction are not a production SDK or custody model.

**Validated development result (2026-08-22):** the laptop account submitted the synthetic fixture using transaction `0x742711453e8fb4397938a9087bba092a3bbcccb423a620b1b3a281d85397cf06`, confirmed in block `25865`. The VPS lifecycle verifier independently retrieved the anchor and confirmed matching receipt ID `0x63eee6e886390ec7873a9a291d21b94e4d1fc5d76be8e6ac072595de9eec8f6e`, commitments root, schema version, and issuer.

## 7. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-19 | Initial Phase 1B prototype specification |
| 0.2 | 2026-08-19 | Added local anchor-verification behavior and read-only retrieval workflow |
| 0.3 | 2026-08-19 | Added data-driven SDK anchor preparation and submission workflow |
| 0.4 | 2026-08-19 | Added optional EIP-191 issuer-attestation sidecar prototype |
| 0.5 | 2026-08-22 | Added strict draft validation and machine-readable schema for shared SDK conformance |
| 0.6 | 2026-08-22 | Added parallel SDK-style CLIs and read-only deployed-anchor lifecycle verification |
| 0.7 | 2026-08-22 | Added synthetic laptop-originated AVR fixture and end-to-end individual-anchor helper |
| 0.8 | 2026-08-22 | Recorded successful laptop-to-chain-to-VPS AVR lifecycle validation |
