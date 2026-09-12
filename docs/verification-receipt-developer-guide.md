# General Verification Receipts: developer guide

Status: implemented additive **0.4.0-alpha**, 2026-09-12. Local reference SDKs;
not a published stable protocol or independently audited release.

Use this format for general application evidence, AI agents, content, supply
chains and physical machines. Use the existing authorized AVR 0.2 flow when you
need the currently implemented historical-authority or ZK-001 policy proof.
Existing receipt hashes, proof statements and Solidity interfaces retain their
original meanings. No consensus/client changes or deployment are required by
this SDK increment.

## Start locally

From the repository root, after `npm ci`:

```sh
node examples/verification-receipt.js
node sdk/typescript/verification-receipt-cli.js derive build/receipt-example/receipt.json
node sdk/typescript/verification-receipt-cli.js validate-profile build/receipt-example/receipt.json spec/verification-receipt/profiles/robotics.json
python sdk/python/verification_receipt_cli.py derive build/receipt-example/receipt.json
```

The example creates a synthetic machine-event receipt, an issuer-signed
presentation and private evidence openings in the ignored build directory. It
makes no network calls. Its addresses and authority evidence are illustrative;
use your actual issuer and deployed anchor address for an integration.

JavaScript/TypeScript imports are from
`sdk/typescript/verification-receipt` (includes `.d.ts`). Python's standard-library
module is `sdk/python/verification_receipt.py`; add that directory to your import
path. Production package distribution/version support is still a release gate.

## Create, sign, anchor, verify

1. Choose a bundled profile or author a profile definition and its specification.
   Give each evidence role a namespaced name, such as `vendor:inspection`.
2. Commit exact evidence bytes with `commitEvidence` / `commit_evidence`.
   Store the returned salt separately in your private evidence vault. For large
   telemetry or video files, `commitEvidenceStream` / `commit_evidence_stream`
   hashes chunks without loading the entire file into memory.
3. Call `createVerificationReceipt(fields, profile)` / its snake_case Python
   equivalent. Supply `context.chainId` as a decimal string and the actual
   individual or batch anchor contract as lowercase `context.anchorContract`.
4. Prepare the signature message using `prepareVerificationAttestation`.
   Sign that exact message with an EIP-191 wallet. The message binds the entire
   receipt, including destination, profile, subject, event and evidence metadata.
5. Create an existing AVR presentation with `commitment-only` or
   `issuer-attested`. Validation of the presentation checks structure and binding;
   call `verifyVerificationAttestation(receipt, signature)` separately to recover
   and check the issuer. Python prepares identical messages but does not yet
   include signature recovery or an RPC client.
6. For an individual `AVRAnchor`, call `anchorReceipt(receiptId,
   commitmentsRoot, schemaVersion)` with fields from `prepareVerificationAnchor`.
   The transaction sender must equal the receipt issuer for the existing
   individual verifier. For relayed batches, anchor a manifest root in
   `ReceiptBatchAnchor`, retain the manifest and the receipt's inclusion proof.
   A batch submitter is not automatically the receipt's signer.
7. The ingress queue accepts general presentations and binds to the first
   general receipt's destination. Use a separate queue for each destination;
   mismatches return `rejected-anchor-context`. A drained batch exposes
   `anchorContext`. The manifest's version describes the batching format, not
   every leaf receipt's schema. Persist evidence/manifests before submission.
8. Verify the pinned profile (`validateReceiptProfile`), its specification bytes,
   evidence openings, signatures and chain inclusion separately. Use
   `verifyPresentationAnchor` against a trusted node with your confirmation
   threshold. It checks successful execution, the transaction/block binding,
   canonical block hash, matching contract event and individual/batch membership.
   It does not establish permanent PoW finality or independently validate the node.

For stream verification, `verifyStreamLink(previous, current)` checks adjacent
sequence numbers, predecessor hash, session ID, profile, subject, issuer and
destination. It detects a gap between supplied adjacent records, not undisclosed
tails or fabricated complete histories. Record local events independently of
network availability and anchor significant events or telemetry windows later.

## Receipt and evidence contract

The JSON schema is
[verification-receipt-v0.4.0-alpha.schema.json](../spec/verification-receipt/verification-receipt-v0.4.0-alpha.schema.json).
SDK validation additionally enforces actual calendar dates, nonzero addresses,
chain-ID range, stream predecessor rules and canonical size. This version
accepts only the documented fields; extensions belong in namespaced commitments
and receipt links, so none are silently discarded from hashing.

| Field | Meaning |
|---|---|
| `schema`, `schemaVersion` | Exact format/version; unknown versions fail |
| `profile` | Profile URI/URN, version and domain-separated definition digest |
| `context` | Intended chain ID and anchor contract; not a freshness proof |
| `issuer` | Lowercase EVM signing identity; may be a machine's gateway |
| `subject` | Namespaced kind and opaque bytes32 identity/artifact commitment |
| `event.id` | Application event ID, normally a persisted random 32-byte value |
| `event.type`, `claimedAt` | Namespaced event type; issuer-claimed recording time |
| `event.observation` | Optional explicit clock, nanosecond ticks and uncertainty |
| `event.stream` | Optional recording session, decimal sequence, predecessor ID |
| `commitments` | 1–32 named evidence descriptors: scheme, digest, media type |
| `links` | 0–32 typed receipt links, including multiple parents or corrections |

Only lowercase ASCII identifiers are accepted in the envelope. Evidence can
contain any bytes, including Unicode, JSON, CBOR, C2PA, credentials, images,
rosbag/MCAP, model artifacts or proprietary formats. The SDK does not parse or
appraise them. Evidence URLs, access tokens and salts are not envelope fields;
retrieval belongs to your access-controlled storage adapter.

Use a consistent exact-byte encoding for JSON evidence; arbitrary object
serialization is not performed for you. Media types are lowercase `type/subtype`
without parameters. Applications define the associated encoding in their profile.
The descriptor is itself bound by the receipt; a matching digest does not prove
that the bytes actually conform to the declared media type.

## Canonical encoding and commitments

Sort JSON object keys recursively, preserve array order, remove insignificant
whitespace, and encode UTF-8. All envelope keys and strings are restricted ASCII;
numbers use canonical decimal **strings**, including nanoseconds and sequence
numbers. This avoids JavaScript/Python number precision and Unicode-sort
differences. Null and booleans occur only in their specified fields. No implicit
normalization or field stripping occurs. `claimedAt` uses exactly
`YYYY-MM-DDTHH:mm:ss.sssZ`, years 0001–9999, with a valid Gregorian date.
There is no general claim of RFC 8785 canonicalization for arbitrary evidence.

Let `D = "aichain:verification-receipt:0.4.0-alpha:"` (UTF-8):

```text
receiptId       = SHA-256(D || canonicalReceipt)
commitmentsRoot = SHA-256(D || "commitments:" || canonicalCommitments)
profile.digest  = SHA-256(D || "profile:" || canonicalProfileDefinition)
salted evidence = SHA-256(D || "evidence:" || 32 raw salt bytes || raw evidence bytes)
plain evidence  = SHA-256(raw evidence bytes)
```

All digests use `0x` plus 64 lowercase hex digits. `commitmentsRoot` is a hash of
the descriptor map, not an evidence Merkle root. To disclose one artifact, supply
the whole small receipt plus that artifact and salt; other artifacts remain
hidden, but the receipt's role names/metadata are visible. Hiding individual
receipt metadata requires a different disclosure profile, not removal of fields.

Default salts are cryptographically random 32-byte values and must survive in
your private storage for later disclosure. Reuse the stored receipt/salt/event ID
for retries. Recreating salts creates a different receipt. Plain SHA-256 is an
explicit option for public artifacts; do not use it to hide guessable private
values. Neither hashing nor salt storage replaces encryption and access control.
The envelope is capped at 12,288 canonical bytes; ingress may reject a large
presentation/proof wrapper separately under its configured size limit.

## Profiles and their trust boundary

[Bundled definitions](../spec/verification-receipt/profiles/) cover generic,
agent, commerce, content, supply-chain and robotics evidence. Each definition
pins `specificationDigest = SHA-256(exact specification bytes)` as well as required
roles, permitted subject kinds and stream/clock requirements. Specification files
are UTF-8 with LF newlines. Changes to semantics require a new version and digest.
Changing a specification without changing its committed digest is detectable by
hashing its bytes. `validateReceiptProfile` validates the supplied definition and
required shape; it does not automatically load or appraise specification text.

Custom profile URIs do not require an on-chain registry or team approval. Pin the
definition and specification through a trusted integration channel. A receipt
can name an unknown profile and still have a verifiable hash; it has **not passed
profile validation** until a matching supported definition has been checked.
No URL fetching or remote code execution is performed by the SDK. Adding role
requirements is not a substitute for writing and running an application verifier.

Keep the following results distinct in your application:

| Check | What success actually means |
|---|---|
| Envelope/hash | Well-formed receipt and reproducible identifier |
| Profile shape | Required roles and structural requirements are present |
| Evidence opening | Disclosed bytes match the committed descriptor |
| Issuer signature | The claimed EVM key signed the exact receipt |
| Chain inclusion | Contract event/membership matches a currently canonical block |
| Authority, policy, hardware evidence | Requires a separately defined trusted verifier |
| Physical truth, safety, completeness | Not established by this receipt format |

General presentations explicitly report `profileValidation: not-checked` and
`signatureVerification: not-checked` in their summary. Their assurance level is
a presentation claim, not an aggregated verification result. A signature is not
a hardware identity or authority credential. Current issuer keys are EVM keys;
native Ed25519/COSE, device key enrollment/rotation, external identity resolution,
multi-party approval, hardware attestation and profile-specific ZK adapters remain
separate work. These can be carried as opaque evidence today, not claimed verified.

## Robotics capture guidance

Use the [robotics profile](../spec/verification-receipt/profiles/robotics.md) for
robots, vehicles, drones and industrial machines. Keep sensor-frame frequency
off-chain; stream commitments over closed file chunks or evidence-window manifests.
The capture adapter must specify time range, sensor IDs, calibration, sample
counts, missing data and chunk ordering inside those private manifests.

Distinguish sensor acquisition time, recorder time and inclusion time. Monotonic
and simulation clocks have session-specific epochs; neither is a UTC timestamp.
Store unknown uncertainty as null. Start a new session after reset, reboot or
key/profile changes and explicitly link it to the predecessor when appropriate.
Never wait for L1 confirmation in a robot's control or emergency-stop loop.

## Validation and remaining release work

```sh
node --test sdk/typescript/*.test.js
python -m pip install pytest jsonschema
python -m pytest sdk/python -q
```

Golden vectors cover six profiles, binary/Unicode evidence, large nanosecond
values, canonical hashes and presentation parity. Negative tests cover profile
substitution, unsupported semantics, malformed data, replay context, salt/data
tampering, signature tampering, stream gaps and canonical block rejection.
The JavaScript integration uses mocked standard RPC responses; this increment
does not claim a new live deployment, hardware trial or throughput benchmark.

Before stable/public release: external developer integration, stable packaging,
Go conformance, durable capture/storage and recovery, authority/signature adapter
policy, independent security review, and live reorg/end-to-end validation of the
general format. Existing roadmap gates remain open until supported by evidence.
