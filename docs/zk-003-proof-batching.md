# ZK-003: Proof-Aware Batching Specification

| Field | Value |
| --- | --- |
| Status | Alpha scope accepted; recursive aggregation deferred |
| Version | `0.1.0-draft` |
| Proof stack | RISC Zero for ZK-001, per ADR-0006 |
| On-chain anchor | Existing development `ReceiptBatchAnchor`; final verifier integration remains ZK-004 |

## 1. Purpose

This format packages many **individual** ZK proof claims for distribution,
audit, and optional L1 root anchoring. It is not an aggregate proof, rollup, or
claim that one proof verifies all receipts.

## 2. Manifest

```json
{
  "schema": "aichain.zk-proof-batch",
  "schemaVersion": "0.1.0-draft",
  "proofSystemId": "<bytes32>",
  "statementId": "<bytes32>",
  "programCommitment": "<bytes32>",
  "createdAt": "<RFC 3339 UTC>",
  "claimCount": 2,
  "claimRoot": "<bytes32>",
  "claims": ["<proof-claim objects>"]
}
```

Each claim contains six `bytes32` values:

| Field | Binding |
| --- | --- |
| `proofSystemId` | Domain-separated RISC Zero system/version identifier |
| `statementId` | ZK-001 statement version |
| `programCommitment` | Deterministic verifier-program version |
| `receiptId` | AVR receipt covered by the proof |
| `publicValuesDigest` | Digest of the exact public journal/values supplied to the verifier |
| `proofDigest` | Digest of the separately available proof artifact |

The leaf is `keccak256` over a domain separator followed by those six packed
values. Parent hashing uses the existing sorted Keccak-256 pair rule; an odd
leaf is paired with itself. The manifest rejects mixed system/statement/program
bindings and duplicate receipt IDs.

## 3. Verification flow

```text
Individual RISC Zero proof + public values
              │
              ▼
Digest proof artifact and public values
              │
              ▼
Create proof-claim leaf → Merkle proof-batch root
              │                         │
              │                         └─ optional L1 root anchor
              ▼
Auditor receives proof + public values + claim inclusion proof
              │
              ▼
Verify individual proof, digest bindings, and Merkle inclusion
```

An auditor must verify all three relevant things: individual proof validity,
digest equality to the supplied artifacts, and inclusion under the claimed
batch root. A root alone is insufficient.

## 4. Tooling

```text
npm run zk:batch -- create fixtures/zk/proof-batch-v0.1.0-draft.json /tmp/proof-batch.json
npm run zk:batch -- inclusion /tmp/proof-batch.json /tmp/proof-inclusion.json 0
npm run zk:batch -- verify /tmp/proof-batch.json /tmp/proof-inclusion.json
```

The fixture uses placeholder digests and is only a format vector; it is not an
actual proof artifact. The implementation is in
`sdk/typescript/zk-proof-batch.js` and shares Merkle semantics with the existing
OVL and receipt-batch tooling.

## 5. Alpha limits

- No recursive proof or aggregate verifier.
- No automatic prover queue, fee market, proof service, or availability layer.
- No final contract/API format, batch-size limit, or reorganisation policy.
- A batch root does not replace individual verification and does not publish
  proof bytes or public values.

These limits are intentional. They keep the alpha assurance boundary clear
while the project measures a future recursive design.
