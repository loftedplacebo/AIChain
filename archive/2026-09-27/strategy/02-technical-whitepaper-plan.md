# Orvessian — technical whitepaper content plan

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

Planning edition · 12 September 2026 · Companion to [Brand and website strategy](01-brand-and-website-strategy.md)

## 1. Purpose and publishing model

Working title: **Orvessian: Verification Receipts for Accountable Autonomous Systems**.

The whitepaper must explain what can be verified, under which assumptions, and how a developer or researcher can reproduce those checks. It is not a longer marketing page or a token sales document.

Produce one versioned technical paper, approximately 25–35 pages excluding appendices, with a two-page executive summary. Publish readable HTML and a matching PDF. Link normative schemas, specifications and reproducible examples from the repository rather than copying every API into the paper. Page ranges are editorial targets, not permission to pad.

Every material statement should be marked through section context as **implemented alpha**, **demonstrated in a bounded experiment**, **proposed**, or **open research**. Record repository commit, environment, versions and review date when preparing the actual paper. This plan is based on inspected documentation, not a fresh execution audit.

## 2. Proposed abstract

Autonomous software and machines produce decisions and actions whose authority and evidence may span multiple systems. Orvessian is developing a verification receipt layer that binds recorded events to signed assertions, private evidence commitments and independently checkable anchors. The architecture separates evidence integrity, issuer identity, authority, policy evaluation and outcome appraisal, rather than treating them as a single assurance. This paper describes the receipt model, organisational evidence boundary, L1 anchoring design and current alpha implementations, then identifies operational and security requirements for broader deployment. Cryptographic inclusion and policy proofs do not establish the truth of every output or the safety of a physical action.

## 3. Chapter-by-chapter contents

### 1 — Problem, scope and requirements · 2 pages

Describe the cross-system accountability problem using the supplier-assessment workflow. Define authorisation, assertion, evidence, verification, appraisal and acceptance. Identify the parties: principal, agent, issuer, runtime, evidence custodian, reviewer, verifier, anchor operator and relying party.

Requirements: portable records, explicit trust assumptions, privacy, versioned semantics, historical checks, operational recovery and interoperable tooling. Non-goals: agent intelligence, universal truth detection, real-time robot control or automatic legal compliance.

**Figure:** one job with responsibility boundaries, not just a chain transaction.

### 2 — Assurance and trust model · 3 pages

Make the distinction between these checks foundational:

| Check | What a successful result establishes | What it does not establish |
|---|---|---|
| Evidence commitment opening | Disclosed bytes match their commitment under the scheme | Truth, completeness or continued availability |
| Issuer signature | A message was signed by the relevant key | That the key belongs to a trustworthy organisation or robot |
| Authority check | The relevant authority conditions hold at a defined reference point | That policy was wise or a runtime actually obeyed it |
| Policy proof | The specified committed computation satisfies its exact proof statement | Model-output truth, complete execution history or physical safety |
| Human attestation | A particular reviewer signed a particular assertion | Infallible judgement or review of material not disclosed |
| Chain / batch inclusion | The record is included in a specified canonical-chain view under verification assumptions | Authorisation of every batch leaf, permanent PoW finality or outcome correctness |
| Domain appraisal | Evidence satisfies a stated verifier's criteria | Correctness beyond the criteria, evidence coverage and verifier trust |

Specify distinct pass, fail, unknown, unsupported, expired and revoked states as appropriate. Preserve raw verification results and provenance; do not collapse them into a single score.

**Figure:** parallel assurance lanes, rather than a ladder implying “on-chain” is the highest truth level.

### 3 — Architecture and data boundaries · 3 pages

Explain the application/runtime integration, organisational control plane, private evidence vault, receipt log, verifier/prover, batching, EVM anchor contracts, indexer and relying-party verifier.

Describe the organisational ledger proposal and related prototypes accurately. Customer-controlled evidence services are not automatically separate blockchains. Detail what remains private, what is disclosed to a reviewer, and what commitments become visible on-chain.

Cover dependencies and failures: a trusted RPC may lie, an indexer may lag, evidence may disappear, a custodian may omit an event. Explain independent verification options and the limits of the current implementation.

**Figure:** trust boundaries and data flows with an explicit legend for implemented versus proposed components.

### 4 — Receipt format, profiles and compatibility · 4 pages

Document the general 0.4.0-alpha envelope: schema/version, pinned profile, destination context, issuer, subject, event identity, claimed time and clock metadata, evidence commitments and receipt relationships. Explain canonicalisation, domain separation, salting, exact-byte hashing, deterministic IDs and signature binding using repository definitions.

Contrast the general format with the existing authorised AVR 0.2 flow. Historical-authority and ZK-001 features must not be silently attributed to every general-format receipt. Supply a compatibility table by feature and language, including Python limitations.

Explain AI, content, supply-chain and machine profiles as examples with distinct appraisal requirements—not a promise of turnkey integrations. Discuss sequence, session and predecessor links: adjacent-record checking does not prove that an entire history was disclosed.

**Artefacts:** one sanitised JSON example, golden vectors and negative vectors. No invented normative fields in the paper; proposals get their own versioned section.

### 5 — Authority and human review · 2–3 pages

Specify organisation registration, delegation, revocation, historical reference points and key rotation according to the implemented flows. Separate protocol-level authority evidence from the proposed richer business mandate and review interface.

For the proposed workflow, define who may approve, what exactly they approve, the evidence version, deadlines and handling of rejection or unavailable reviewers. Distinguish pre-action permission from post-action acceptance. Record later revocation without rewriting history.

**Figure:** proposed business lifecycle with pending review, rejection, timeout and revocation branches. Label it as a product-level model, not an existing universal on-chain state machine.

### 6 — Proofs and verifier governance · 3 pages

State ZK-001 precisely: deterministic evaluation of a committed action against committed policy/configuration, not proof that a named model ran or that its answer is true. Explain witness, public journal, receipt binding, pinned guest image, proof verification and version handling.

Describe the demonstrated RISC Zero / EVM adapter path and separately the proposed or prototype production verifier governance. The alpha's direct adapter verification must not be represented as exercising a delayed registry activation process.

Cover who approves verifier versions, trusted artefact provenance, upgrade delays, compromised verifier response, historical verification and emergency authority. Keep unresolved governance parameters explicit.

### 7 — L1, batching and recovery · 3 pages

Describe the independent EVM-compatible PoW direction and why neutral anchoring is sought. Distinguish the custom-genesis Ethash alpha reproduction from the KawPoW development candidate and unselected final network parameters.

Explain Merkle roots, manifests, leaf signatures, canonical inclusion, confirmation assumptions, reorgs, retry/idempotency, durable outboxes and orphan re-anchoring. A batch submitter is not automatically every leaf's issuer. Do not equate queue admission with durable acceptance.

Include the strongest objections to a new L1: security bootstrapping, ecosystem and liquidity costs, operator burden and using existing settlement infrastructure instead. State which requirements justify the current direction and what evidence would challenge it. Do not retrofit a claim that a new chain is mathematically necessary for portable receipts.

**Figure:** separate record-created, submitted, included, confirmed, orphaned and re-anchored states; avoid an irreversible “verified forever” endpoint.

### 8 — Privacy, security and operational threat model · 3–4 pages

Threats: compromised issuers, malicious reviewers, collusion, replay, weak or fabricated evidence, omitted events, leaked salts, metadata correlation, revoked authority, malicious RPC/indexers, data loss, availability attacks, verifier bugs and reorgs.

For each: attacker capability, affected assurance, mitigation, test and residual risk. Explain retention, backups, disclosure controls, offline recovery and immutable commitments versus evidence deletion. An anchor cannot recover lost source evidence.

Robotics subsection: gateway identity is not hardware attestation; clock provenance matters; sensors may lie; event logs need protected capture. State the absence of live-device or safety certification evidence where applicable.

**Artefact:** threat/control/test matrix with unresolved high-impact items clearly visible.

### 9 — Evaluation and current evidence · 3 pages

Summarise what the documented integrated alpha reproduced: authority, signature checks, real narrowly scoped proof verification, batches, index recovery and lookups. Report the synthetic mixed-workload result only with workload, hardware, software, duration and failure boundaries from the actual report.

Do not transform a 1,000-receipt bounded run into sustained production throughput. Separate mocked SDK/RPC tests, offline machine examples, actual local-chain integration, independent replication and future field trials.

Proposed evaluation programme: independent developer completion, negative-verification coverage, evidence loss/recovery, canonical reorg handling, audit-package reconstruction time and profile-specific appraisal quality. Human accuracy and false acceptance need labelled ground truth and a study design, not a marketing estimate.

### 10 — Economics, roadmap and open questions · 2–3 pages

Separate company revenue, network security funding and application payment settlement. Discuss managed verification/evidence services and enterprise support as business hypotheses. Describe native-token and work-reward research as proposals, not approved allocations or return expectations.

Any work-linked reward proposal needs treatment of wash activity, collusion, sybil buyers, subjective quality, verifier costs, subsidy dependence and dispute funding. Exclude unapproved supply numbers from the executive narrative.

Roadmap gates: external developer trial, durable evidence operations, explicit verifier contract, stable SDK packaging/security review and live general-format integration evidence. Closed-testnet operations require their own release approval and evidence.

End with open questions, design alternatives and conditions under which the design should change.

## 4. Appendices and developer companions

- Exact schema/profile references and canonical golden vectors.
- Authorised AVR/general-format compatibility table.
- Proof statement and verifier artefact provenance.
- Reproduction instructions with versions, commit IDs and sanitised outputs.
- API/CLI reference links; troubleshooting and negative examples.
- Threat model, benchmark methodology and limitations register.
- Separate economics research appendix, only after factual and appropriate specialist review.

Keep tutorials task-based in developer docs. The paper explains why and under what assumptions; the quickstart explains what to run.

## 5. Source map and release gate

Authoritative starting points in the active checkout:

- [General receipt guide](C:/AIChain/docs/verification-receipt-developer-guide.md) and [readiness review](C:/AIChain/docs/verification-receipt-readiness-review.md).
- [Integrated alpha](C:/AIChain/docs/archive/2026-09-27/completed-stages/phase-3-integrated-alpha.md) and its sign-off/evidence references.
- [Organisational architecture proposal](C:/AIChain/docs/archive/2026-09-27/superseded-plans/future-proof-organisational-verification-architecture.md).
- [Closed-testnet foundation](C:/AIChain/docs/archive/2026-09-27/own-chain/phase-4-closed-testnet-foundation.md).
- Existing [product direction](../early-research/product-layer.md), [economics research](../early-research/report-source.md) and [scaling research](../early-research/scaling.md), treated as proposals where they conflict with newer implementation evidence.

Before publication, reconcile every technical claim with code/specification at a pinned commit; independently reproduce at least the advertised quickstart; review privacy and threat assumptions; check all diagrams against actual boundaries; ensure HTML/PDF version parity. Add external standards references only after checking their current primary specifications and clearly distinguish architectural inspiration from implemented compatibility.

The result should make a strong engineer more interested because the limits are precise—not leave them guessing what “verified AI” means.
