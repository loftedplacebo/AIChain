# Organisational Verification Ledger Prototype

| Field | Value |
|---|---|
| Status | Development-only reference implementation |
| Version | 0.1.0-draft |
| Last updated | 2026-08-22 |
| Decision | [ADR-0002](./decisions/0002-organisational-verification-ledger.md) |

## Purpose

This prototype turns the accepted OVL direction into a minimal, locally reproducible path:

```text
private receipt IDs → sorted Merkle root → OVL checkpoint → ReceiptBatchAnchor → inclusion proof
```

It does not store private evidence, authenticate an organisation, sign a checkpoint, enforce sequencing, or provide a production API. Those items remain deliberately **TBD**.

## Input

Create a private local input file such as `devnet/ovl-demo-input.json`:

```json
{
  "organisationRef": "org:demo-private",
  "ledgerId": "ledger:demo-private",
  "epoch": 0,
  "createdAt": "2026-08-22T12:00:00Z",
  "receiptIds": ["0x<32-byte receipt ID>", "0x<32-byte receipt ID>"]
}
```

`organisationRef` and `ledgerId` are private prototype labels. Do not submit customer names, raw evidence, prompts, outputs, policies, or credentials to the public chain.

## Seal and inspect

```powershell
cd C:\AIChain
node sdk/typescript/ovl-cli.js seal devnet/ovl-demo-input.json devnet/ovl-demo-checkpoint.json 0
```

The output contains the checkpoint, its root, and a Merkle proof for the selected receipt. Pair hashing is sorted Keccak-256 and therefore matches `ReceiptBatchAnchor`.

## Anchor from the laptop

With the laptop node running and the ignored `.env.laptop-dev` configured:

```powershell
node scripts/submit-laptop-ovl-checkpoint.mjs `
  devnet/ovl-demo-checkpoint.json `
  0x871252AE9E27BDf8265402a70A0Fb04B55b64dF7
```

The helper submits the checkpoint root and leaf count to the existing development `ReceiptBatchAnchor`; it emits only the transaction hash and writes a local ignored report. It never prints the account password.

## Verification boundary

Verify both local and on-chain membership without a key or password:

```powershell
node scripts/verify-ovl-checkpoint.mjs devnet/ovl-demo-checkpoint.json
```

The existing contract verifier validates the proof after anchoring. The OVL root establishes membership of a given receipt ID, while the transaction establishes chain inclusion of that root. A verifier still needs the right authority, attestation, policy, and disclosure evidence for any higher-level claim.

## Tests

```powershell
npm run test:ovl:typescript
```

The tests prove that the generated proof validates against the checkpoint root and that a substituted receipt fails.
