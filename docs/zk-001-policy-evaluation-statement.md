# ZK-001: Private Policy Evaluation Statement

| Field | Value |
|---|---|
| Status | Accepted for Phase 2B evaluation; not production-final |
| Statement version | `0.1.0-draft` |
| AVR profile | Authorised AVR `0.2.0-draft` |
| Rule set | `aichain.policy.allowlist-v1` |
| Last updated | 2026-08-28 |

## 1. Plain-Language Claim

The prover knew a private action, private policy, private configuration, and commitment blindings which:

1. reproduce the six commitments and commitments root of a particular Authorised AVR;
2. reproduce that receipt's identifier and public identity/authority bindings; and
3. when evaluated by the versioned deterministic allowlist program, produce the publicly declared `allow` or `deny` decision and committed result.

The proof is useful because an organisation can demonstrate consistent policy evaluation without publishing the action, policy, configuration, or detailed reason codes.

## 2. Explicit Non-Claims

This statement does **not** prove that:

- the AI output is true, safe, useful, or produced by a particular model;
- the declared provider or model actually performed an inference;
- an off-chain action was executed in the real world;
- the issuer or organisation is trustworthy;
- the authority commitment was valid at execution or inclusion time;
- the claimed timestamp is independently authoritative; or
- the policy itself is appropriate, lawful, complete, or current.

Those properties require separate attestations, registries, proofs, or governance rules.

## 3. Public Inputs

| Input | Meaning |
|---|---|
| `statementId` | SHA-256 identifier of this statement version |
| `programCommitment` | SHA-256 identifier of the deterministic allowlist program |
| `receiptId` | Authorised AVR identifier reconstructed by the program |
| `commitmentsRoot` | Root over the receipt's six commitments |
| `issuer` | Lowercase EVM issuer address included in the receipt |
| `organizationId` | Opaque organisation identifier included in the receipt |
| `authorityCommitment` | Opaque authority reference included in the receipt |
| `claimedAtEpochSeconds` | Claimed execution time used to reconstruct the receipt |
| `decision` | `allow` or `deny` |
| `resultCommitment` | Blinded commitment to the full decision and reason-code result |

The public organisation and authority fields are bindings only. This statement does not validate them against `AuthorityRegistry`.

## 4. Private Witness

- Action: `operation`, `resource`, and unsigned 63-bit `amount`.
- Configuration: `enforceResource` and `enforceAmount` flags.
- Policy: sorted unique operation/resource allowlists and unsigned 63-bit `maxAmount`.
- Four independent 32-byte blindings for action, result, configuration, and policy.
- Opaque model and provider commitments. They are carried into the receipt but not opened or otherwise validated by this statement.

Raw prompts, outputs, policy text, credentials, and business evidence are outside the witness and remain off-chain.

## 5. Deterministic Evaluation

Violations are evaluated in this fixed order:

1. `operation-not-allowed`;
2. `resource-not-allowed` when resource enforcement is enabled; and
3. `amount-exceeds-limit` when amount enforcement is enabled.

No violations produces `allow`; one or more violations produces `deny`. The committed result is:

```json
{
  "decision": "allow|deny",
  "reasonCodes": [],
  "ruleSet": "aichain.policy.allowlist-v1"
}
```

Canonical JSON uses UTF-8, lexicographically sorted object keys, compact separators, ordered arrays, JSON booleans, and base-10 integers. All allowlists must already be sorted and unique; implementations must reject rather than silently reorder them.

## 6. Domain Separation and Commitments

Each private commitment is:

```text
SHA-256(UTF8("aichain:zk-witness:0.1.0-draft:<kind>:")
        || 32-byte blinding
        || canonical JSON value)
```

`<kind>` is `input`, `output`, `configuration`, or `policy`. The existing Authorised AVR `0.2.0-draft` domains derive the commitments root and receipt ID. The statement and program identifiers are SHA-256 hashes of:

```text
aichain:zk-statement:policy-evaluation:0.1.0-draft
aichain:zk-program:policy-evaluation:allowlist-v1
```

SHA-256 is retained for compatibility with the current draft AVR. Production commitment primitives and post-quantum migration remain separate open decisions.

## 7. Verification and Failure Rules

A verifier accepts only when the proof is valid for the exact program commitment and every public input matches. Wrong receipt, root, result, statement/program version, identity binding, timestamp, malformed encoding, or unsatisfied witness must fail.

A later aggregate proof must preserve an unambiguous binding to every covered receipt and statement version. Aggregation design remains **TBD** under ZK-003.

## 8. Reference Artifacts

- Golden fixture: `fixtures/zk/policy-evaluation-v0.1.0-draft.json`
- Python reference: `spikes/zk-statement/python/reference.py`
- TypeScript reference: `sdk/typescript/zk-policy-statement.js`
- Go reference: `sdk/go/zkpolicystatement/statement.go`
- Threat model: `docs/zk-001-threat-model.md`

These are semantic references for stack evaluation, not a production prover or circuit. RISC Zero, SP1, and Halo2 must implement the same inputs, outputs, rejection behavior, and golden vector before performance comparisons are valid.

## 9. Remaining Decisions

- ZK-002: proof stack selection.
- ZK-003: individual versus aggregate proof design.
- ZK-004: verifier interface, gas/resource limits, upgrades, and security review.
- Final AVR schema, commitment primitive, authority validation, and disclosure profiles.
