# Organisation View and Disclosure Prototype

| Field | Value |
|---|---|
| Status | Development-only local control-plane prototype |
| Version | 0.1.0-draft |
| Last updated | 2026-08-22 |
| Related decision | [ADR-0002](./decisions/0002-organisational-verification-ledger.md) |

## Purpose

This prototype adds a private organisational view above the OVL checkpoint tooling. It makes the intended enterprise product boundary concrete without exposing operational evidence to AIChain:

```text
private inventory (agents, policies, configurations, checkpoints)
    → local organisation report
    → selected receipt + proof + private evidence reference
    → auditor disclosure package
```

The report and disclosure package are local JSON files. They are not a hosted dashboard, identity system, access-control system, or production evidence vault.

## Local organisation report

The committed fixture contains synthetic data only:

```powershell
cd C:\AIChain
node sdk/typescript/organisation-view-cli.js report `
  fixtures/ovl/organisation-view-v0.1.0-draft.json `
  devnet/organisation-view-report.json
```

The report counts active agents, policies, configurations, and anchored checkpoints. Use a private local input file for real organisational data; do not commit it or submit it to the chain.

## Auditor disclosure package

After sealing an OVL checkpoint, create a minimal package for one receipt:

```powershell
node sdk/typescript/organisation-view-cli.js disclose `
  devnet/ovl-demo-checkpoint.json `
  devnet/ovl-demo-disclosure.json `
  "vault://private/authorised-reference"
```

The package contains the selected receipt ID, checkpoint metadata, and Merkle siblings. It contains an **evidence reference only**, never raw evidence. An authorised auditor separately obtains and verifies the evidence under the organisation's access policy.

Use the read-only chain verifier from the OVL prototype to confirm the same checkpoint root is anchored:

```powershell
node scripts/verify-ovl-checkpoint.mjs devnet/ovl-demo-checkpoint.json
```

## Current boundaries

- Agent/policy/configuration IDs and statuses are private local records, not final credentials or registries.
- Evidence references are illustrative; a real vault, encryption, access controls, retention, and legal holds remain **TBD**.
- The package proves membership of a receipt ID in a checkpoint; it does not by itself prove authority, policy compliance, the truth of an event, or that all events were included.
- A browser dashboard, auditor portal, C2PA profile, signatures, and on-chain authority binding are later work.

