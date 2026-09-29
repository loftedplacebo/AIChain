# Example: reconstructing one AI-assisted customer decision

Status: illustrative synthetic scenario for product design, not a production
record, not a live Base transaction, and not evidence that the model actually
ran. Values labelled “example” are fabricated. This example intentionally
distinguishes captured claims from cryptographic checks.

## The decision

An insurance operations team uses an AI assistant to recommend whether a
low-value equipment claim should be routed for manual review. The assistant
recommends manual review because a document conflicts with the submitted
invoice. A human reviewer accepts the route. The final business decision is
still made by the human, and the customer can see exactly which evidence and
rules were involved.

## What the portal presents

**Case:** `case_01J8EXAMPLE`<br>
**Run:** `run_01J8EXAMPLE`<br>
**Decision:** route to manual review<br>
**Business outcome:** human reviewer accepted the route<br>
**Source visibility:** input, invoice and source document are restricted; this
synthetic example reveals redacted summaries only.

| Time (example UTC) | Timeline event | Visible facts and evidence |
|---|---|---|
| 09:14:03.104 | Case opened | Case reference `CLM-2048`; actor `claims-intake-v3`; customer’s case-system event ID and signed gateway observation. |
| 09:14:03.220 | Model run requested | Declared provider `Example Provider`; model `claims-assistant`; deployment `claims-assistant-prod-17`; immutable deployment digest and registry version. This is a captured declaration unless provider/runtime attestation is separately available. |
| 09:14:03.231 | Input assembled | Prompt-template version `claim-review-12`; prompt and normalized request commitments; private source-document IDs, access policy and document digests. Portal shows redacted text to this role. |
| 09:14:04.006 | Retrieval completed | Retriever version, index snapshot, document IDs and ranked chunk references; query and chunk commitments; retrieval count and scores if the profile permits disclosure. |
| 09:14:04.011 | Tool called | `invoice-checker` version `4.2.1`; request/response commitments; result `invoice date conflicts with submitted schedule`; tool service identity/signature. |
| 09:14:04.900 | Model output captured | Output summary “manual review recommended”; exact output commitment; provider request ID, declared model/deployment and generation settings. The record does not prove the model’s answer is correct. |
| 09:14:04.920 | Policy evaluated | Policy `claims-routing` version `8`; rule `document_conflict_requires_review`; outcome `review_required`; evaluator build digest. A supported ZK policy proof could establish only the exact deterministic rule statement it encodes. |
| 09:16:52.882 | Human review | Reviewer identity/role, disposition `accept route`, reason code `document_conflict`, and signed action. Restricted note is disclosed only to permitted roles. |
| 09:17:01.120 | Decision recorded | Business system action ID, destination queue, case status and linked prior events. This is the recorded downstream action; independent confirmation requires a signed downstream-system receipt or trusted connector. |
| Later | Correction / appeal | Any correction is a new linked, signed event with reason, actor and superseded record. Prior evidence is not silently overwritten. |

The detail screen groups the exact request, declared model/configuration,
retrieval and tool events, policy version/result, human disposition, and final
business action. For each source item it offers permitted preview/download,
commitment comparison, original signer/role, observation time and disclosure
history. It shows unavailable or withheld content as such; a digest alone is
never displayed as if it were the underlying evidence.

## Illustrative receipt content

The current 0.4.0-alpha receipt envelope can bind namespaced commitments and
event/subject identities. This compact excerpt uses the actual alpha field
shape, but the names and digest values below are fictional placeholders. It is
not a complete valid fixture: production semantics, signing and anchoring are
still design work.

```json
{
  "schema": "aichain.verification-receipt",
  "schemaVersion": "0.4.0-alpha",
  "profile": {
    "id": "urn:aichain:profile:enterprise-ai-decision",
    "version": "0.1.0-draft",
    "digest": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "context": {
    "chainId": "84532",
    "anchorContract": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "issuer": "0xcccccccccccccccccccccccccccccccccccccccc",
  "subject": {
    "kind": "core:service",
    "id": "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  },
  "event": {
    "id": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "type": "ai:decision-recorded",
    "claimedAt": "2026-09-26T09:17:01.120Z"
  },
  "commitments": {
    "ai:configuration": {
      "scheme": "sha256-salted-v1",
      "digest": "0x1111111111111111111111111111111111111111111111111111111111111111",
      "mediaType": "application/json"
    },
    "ai:input": {
      "scheme": "sha256-salted-v1",
      "digest": "0x2222222222222222222222222222222222222222222222222222222222222222",
      "mediaType": "application/json"
    },
    "ai:output": {
      "scheme": "sha256-salted-v1",
      "digest": "0x3333333333333333333333333333333333333333333333333333333333333333",
      "mediaType": "application/json"
    },
    "ai:policy": {
      "scheme": "sha256-salted-v1",
      "digest": "0x4444444444444444444444444444444444444444444444444444444444444444",
      "mediaType": "application/json"
    }
  },
  "links": []
}
```

In the full profile, tool calls, retrieval events, human review and final
business action should be separate linked receipts rather than opaque text
stuffed into this one envelope. Each points to a versioned evidence object and
uses typed links to preserve order, corrections and supersession. Exact fields
must be specified before this becomes normative.

## What the auditor receives and reconstructs

With the customer's authorization, the portal exports a self-contained bundle:

1. Versioned profile and schema definitions, canonicalization rules and the
   verifier version.
2. Signed receipt/event graph, issuer key identifiers, certificate/delegation
   material, revocation state and historical authorization evidence.
3. Structured governance event records, evidence references and commitments.
   If the auditor needs source objects, the customer retrieves and supplies
   those directly from its own systems; AIChain does not receive or store them.
4. Receipt-to-batch inclusion proof, batch manifest, signed OVL checkpoint,
   previous-checkpoint link and any sequence/gap report.
5. Base chain ID, anchor contract, transaction receipt/log, block number/hash,
   canonical block observation and confirmation-policy report.
6. Any policy-proof statement/version, public inputs, proof and verifier
   result; plus the exact limitation of what the statement establishes.
7. A machine-readable verification report with pass/fail/not-provided for each
   check and its inputs, plus an intelligible timeline for human review.

An offline verifier recomputes signatures, receipt IDs, graph links, inclusion
proofs and chain event matching without calling the portal. The auditor can
therefore reproduce the integrity result from the structured bundle. If source
evidence is needed, the customer supplies it directly and the auditor checks
its commitment locally; AIChain never receives that source. If it is withheld,
the auditor can assess only the committed claim and disclosed metadata.

## Honest assurance report for this example

| Check | Example result | What it supports | What it does not support |
|---|---|---|---|
| Evidence commitment openings | Pass for disclosed objects | The opened bytes match the values committed in this receipt. | Truth, completeness or quality of those bytes. |
| Receipt/event signatures | Pass for identified gateway and reviewer keys | Those keys signed the exact captured claims/actions. | Real-world identity unless trust/delegation records bind it; truthful capture. |
| Model/deployment declaration | Present; self-declared in this example | Which model and deployment the gateway says it invoked. | Independent proof that provider executed those weights/settings. |
| Retrieval/tool lineage | Integrity pass if signed records and openings verify | Captured documents/tool messages match their commitments and links. | That every relevant source or tool call was captured. |
| Policy result | Rule evaluation recorded; proof optional | A signed claim, or the exact narrow proof statement if valid. | Overall decision correctness or adequacy of the policy. |
| Human review | Signature pass | The reviewer key approved the recorded route. | Whether the reviewer was qualified or the decision was substantively right. |
| Batch membership | Pass if manifest proof matches anchored root | This receipt ID was included in the batch. | Whether other relevant records were omitted before batching. |
| Base inclusion/canonicality | Pass under stated observation policy | The batch root was included in a canonical Base event as observed. | Permanence beyond the stated chain/finality assumptions. |
| Completeness | No detected gap only within declared stream/checkpoint scope | The presented sequence is internally continuous for that scope. | Proof that no event was withheld before the sequence was sealed. |

## What this means for implementation

This is the target customer experience, not the current live feature set. The
first development increments should be: (1) normative AI decision profile and
linked event graph; (2) portable signed evidence bundle and offline verifier;
(3) local reference capture-to-export flow; (4) authenticated tenant API and
durable private manifest/evidence adapter; (5) portal timeline, model/policy
registry, disclosure and audit export; (6) production Base indexer/query and
reorg/finality UI integration. Keep Base anchor facts and customer-held evidence
visibly separate throughout.
