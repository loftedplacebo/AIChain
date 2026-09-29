# Governance records, receipts and Base — 2026-09-27

> Current baseline — 27 September 2026: [Platform current state](platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

## Delivered scope

The authenticated workspace now connects each accepted structured governance
record to a recording-service signature, a private batch inclusion proof and
fresh Base Sepolia verification. This supports investigation across the wider
governance portal; it does not replace operational metrics or outcome assessment.
Source conversations, documents, media and raw sensor data remain customer-held.

The local synthetic Northstar workspace has 182 signed records in one batch.
Harbour has 10. These batches have **not been broadcast**. The portal correctly
shows **Signed and batched**, rather than claiming chain inclusion. Existing
unrelated testnet transactions must not be attached as evidence for these roots.

## Evidence contract and trust boundaries

The existing receipt SDK canonicalizes the full accepted event, including the
server-assigned `receivedAt`. A randomly salted SHA-256 commitment binds those
exact bytes. The receipt uses profile `urn:aichain:profile:governance-record`,
version `1.0.0`; its specification digest hashes this exact UTF-8 sentence:

`governance-record-v1:canonical accepted event including server receivedAt; recording-service attestation, not source authentication`

The recording service signs the existing EIP-191 receipt attestation. This proves
that the configured recording key signed the record commitment. It does not
authenticate the customer's agent, prove complete capture, or establish accuracy
or safety. Customer source signature verification remains a separate development
gate. Historical trusted public signer addresses must be retained through rotation.

Receipts are assembled into a Merkle batch (operator limit 1–1,000). The batch ID
is bound to the expected publisher and anchor contract. Only the root, count and
schema version enter transaction calldata. Records, tenant identifiers, signatures
and commitment-opening salts stay off chain.

The bundle is stored alongside the event in tenant/project-scoped SQLite or
PostgreSQL storage. Batch creation commits all bundles and outbox updates
atomically. Signed content is immutable; transaction attachment uses optimistic
revision checks. The operator appends transaction hashes, with a five-attempt
limit. No public mutation endpoint or signing key is exposed to the browser.

## Portal and API

`GET /v1/evidence/:eventId` requires the same scoped authorization as event reads.
It returns one authorized event, its private bundle and freshly computed checks.
The workspace shows the record match, recording-service signer, receipt ID,
batch proof/count/root, expected publisher and available transaction details.
Recheck clears the old panel while requesting a new result.

The JSON download contains that single record and its commitment-opening data,
signature and membership proof. It does not disclose a complete batch manifest
or another customer's mapping. Treat downloaded bundles as sensitive evidence.
Aggregate reports do not verify every record; their assurance fields direct the
reader to individual record evidence instead of asserting a global chain state.

| State | Meaning |
|---|---|
| Queued | Accepted record has no prepared evidence bundle yet. |
| Signed and batched | Record, trusted recorder signature and membership match; no attached transaction. |
| Submitted | Hash attached, but live RPC verification is not configured. |
| Confirming | Matching canonical anchor has fewer than the configured confirmations. |
| Confirmed | Matching canonical anchor meets the default 12 L2-block threshold. |
| Reorg detected / not found | Prior block is no longer canonical or transaction is unavailable. |
| Unavailable | Live verification failed to obtain required RPC data. |
| Invalid / untrusted / failed | Record, signature, trust configuration, transaction or anchor checks failed. |

Confirmation means L2 confirmations, **not Ethereum finality**. Each inspection
checks the record commitment, pinned profile, trusted signer, batch proof, chain
84532, pinned contract runtime hash, successful receipt, canonical block and V2
event publisher/batch ID/root/count/schema. RPC failures never reuse a stored
confirmed result. Outbox `batched`/`submitted` states describe preparation and
attachment; they are not proof of current chain inclusion.

## Operator workflow

Apply migration `002-governance-evidence.sql` after migration 001 for PostgreSQL,
then apply the updated runtime grants. SQLite creates the additive table at
startup. Keep backup/restore coverage for both event and evidence tables.

Configure explicit `GOVERNANCE_TENANT`, `GOVERNANCE_PROJECT` and either
`GOVERNANCE_DB` or the PostgreSQL driver/database settings. For preparation set
`GOVERNANCE_RECEIPT_KEY_FILE`, `GOVERNANCE_PUBLISHER` and optionally
`GOVERNANCE_BATCH_LIMIT` (default 100; maximum 1,000).

```text
node scripts/governance-evidence.cjs prepare
node scripts/governance-evidence.cjs attach <batchId> <transactionHash>
node scripts/governance-evidence.cjs verify <downloaded-evidence.json>
```

`prepare` produces reviewable calldata and stores the batch; it never broadcasts.
Save its output. `attach` records a candidate hash, not a confirmation. `verify`
accepts a bounded record-specific JSON download and recomputes checks rather
than trusting its exported verification summary. With explicit trusted public
signer addresses and a read-only Base Sepolia RPC URL, exit 0 means the record
commitment, recording signature, signer trust, batch membership and current
canonical Base inclusion meet the 12-confirmation pilot rule. Exit 2 means the
export is incomplete or chain verification is unavailable; exit 1 means invalid
evidence, untrusted signer, failed transaction or chain mismatch. A later chain
reorganisation remains possible, so record the check time and rerun when needed.

The API and independent verifier accept `GOVERNANCE_RECEIPT_SIGNERS` as a JSON
array of trusted public addresses and optional `GOVERNANCE_EVIDENCE_RPC_URL`.
The API loads no private key. RPC calls are bounded and read-only. This pilot
accepts demo/test events and pins the deployed Base Sepolia anchor at
`0x5781540e4682a9d35011c94a25f615e438e8e7af`.

The local launcher stores its development key in ignored
`build/workspace-local/recording-service.key` and saves reviewable proposals at
`build/workspace-local/northstar-batch-proposal.json` and
`build/workspace-local/harbour-batch-proposal.json`. Expected publisher is the
Fluxora test wallet. Do not copy this local key into a production environment.

## Validation and next gates

Receipt/API/SDK tests cover tampered records and signatures, tenant isolation,
atomic rollback, stale revisions, publisher/code mismatches, confirmations,
reorgs and outages. Chain response tests use simulated RPC responses; the new
governance batches have not yet completed a live-chain acceptance cycle.
The website production build and 20 tests passed. Native PostgreSQL acceptance
also exercised signed storage, scoped exports, backup restoration and a clean
restart. Results: `validation/governance-evidence-native-2026-09-27.json`.
Browser inspection confirmed the incident's exact record match, valid signature
and membership in the 182-record batch.

Next: submit a prepared synthetic batch, attach its actual hash and confirm the
portal's live status and independent export verification. Then connect a durable
batch worker and sponsored relayer with recovery and reconciliation. This release
does not include automatic broadcasting, resubmission, or indexer subscriptions.

Before production: managed signing keys and rotation, separate worker/read roles,
identity-provider integration, encrypted storage/backups and retention policy,
evidence storage accounting (current event `stored_bytes` excludes sidecars),
verification caching with explicit freshness/reorg invalidation, queue capacity
tests, and separated development/test/production environments. No VPS or public
website deployment was performed in this increment.

## Live acceptance handoff — 2026-09-27

Run node scripts/governance-anchor-local.cjs to preflight the existing Northstar proposal and serve http://127.0.0.1:8792 in Edge. The dedicated listener serves only its page and public proposal; it does not expose filesystem paths or keys. It requires a same-origin JSON submission, verifies a candidate transaction against the batch and pinned Base contract before attaching it to all 182 records, and writes the result to ignored build/workspace-local/northstar-anchor-result.json. A user completes the MetaMask signature. No transaction has been broadcast at this handoff.

Live preflight verified chain 84532, contract runtime, every stored record/proof, expected Fluxora publisher and exact calldata. Gas estimate was 94,943 units, with approximately 0.05 test ETH in the wallet. Fee and balance are snapshots, not guarantees. HTTP checks confirmed key-file paths are unavailable and cross-origin/malformed submissions are rejected. Pending/delayed transactions can be rechecked through the page without sending a second transaction.

## Live acceptance result — 2026-09-27

Northstar's 182 records were linked to successful Base Sepolia transaction 0x128e3141042cfe0b4d3dbf6fe6015b2491fd9dc78bedc31281ce7fdcca8753a8, canonical block 47372429. The first recorded successful check had 32 L2 confirmations against the threshold of 12. See validation/governance-live-anchor-2026-09-27.json. An initial RPC head lag returned insufficient confirmations; this now reports temporary unavailability and allows the submission page to retry, without skipping canonical block or event checks. The regression suite passes. Harbour remains prepared but unsubmitted.

The authenticated API returned confirmed at 117 L2 confirmations, and the independent CLI verifier recomputed the exported record's evidence at 118 confirmations. Both checks passed against the live public RPC.
