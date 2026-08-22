# Authorised AVR Prototype

| Field | Value |
|---|---|
| Status | Development-only reference profile and contract |
| Profile version | `0.2.0-draft` |
| Last updated | 2026-08-22 |
| Dependencies | `AuthorityRegistry`; [ADR-0002](./decisions/0002-organisational-verification-ledger.md) |

## Purpose

The `0.2.0-draft` Authorised AVR profile is additive: it leaves the deployed `0.1.0-draft` AVR format and anchors unchanged. It binds a receipt to an opaque organisation identifier and authority commitment, then requires the submitting EVM account to have an active matching delegation in `AuthorityRegistry`.

```text
authorised receipt (organisation ID + authority commitment + private commitments)
      → submitting agent wallet
      → AuthorityRegistry active delegation and matching commitment
      → AuthorisedAVRAnchor
```

## What the contract verifies

`AuthorisedAVRAnchor` verifies at submission time that:

1. the receipt/root/organisation/authority fields are non-empty;
2. the sender has an active delegation for the supplied organisation; and
3. the delegation's registered authority commitment equals the receipt's authority commitment.

It stores the opaque receipt root, organisation ID, authority commitment, sender, schema version, and inclusion time.

## What it does not verify

- real-world organisation identity or legal authority;
- the private policy/configuration represented by commitments;
- that an execution happened at the claimed time; or
- historical delegation state at an arbitrary past time.

Those are intentionally separate decisions. A final profile will need a versioned credential format, signature/crypto suite, issuer trust, revocation semantics, and disclosure rules.

## Signed agent-credential sidecar

The prototype includes a distinct, off-chain `aichain.agent-credential` envelope. It binds an issuer and subject wallet, opaque organisation/authority/policy/configuration commitments, and a validity window. Its `credentialId` is derived from canonical JSON and signed as an EIP-191 message in the development helper.

This credential is **not** verified by `AuthorisedAVRAnchor`; the contract independently checks the sender's live `AuthorityRegistry` delegation. Keeping those two checks separate makes the assurance boundary explicit. EIP-191 is a development transport profile, not a final cryptographic or post-quantum decision.

```powershell
cd C:\AIChain
node scripts/sign-laptop-agent-credential.mjs `
  fixtures/avr/agent-credential-v0.1.0-draft.json `
  devnet/agent-credential-package.json `
  0x871252AE9E27BDf8265402a70A0Fb04B55b64dF7
node scripts/verify-agent-credential.mjs devnet/agent-credential-package.json
```

## Fixture and test

The synthetic fixture references the already-deployed development organisation and agent delegation only. It contains no private evidence.

```powershell
cd C:\AIChain
npm run test:authorised-avr:typescript
npm run test:agent-credential:typescript
```

Before deployment, test the contract in Foundry on the VPS after pulling this commit:

```bash
cd /opt/aichain
git pull --ff-only
cd contracts/avr-anchor
/root/.foundry/bin/forge build
```

Deploy using the controller account's encrypted keystore; the script prompts privately and neither stores nor prints the password:

```bash
cd /opt/aichain
bash ./scripts/deploy-authorised-avr-anchor.sh
```

Copy the resulting contract address, then use the already delegated VPS agent to submit the synthetic fixture:

```bash
cd /opt/aichain
CONTRACT_ADDRESS=0x<deployed-authorised-anchor> \
  bash ./scripts/anchor-authorised-avr.sh \
  fixtures/avr/authorised-receipt-v0.2.0-draft.json
```

The VPS submission helper derives the anchor fields through the Python reference implementation, so it does not require Node.js on the server. Deployment and live authorised submission require encrypted-keystore passwords, so those steps remain an operator action rather than an automated secret-handling step.
