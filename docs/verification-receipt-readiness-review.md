# Verification receipt readiness review — 2026-09-12

**Verdict:** the L1 anchoring primitive is flexible; the original developer-facing
receipt format was too AI-specific to be the general product promised by the
vision. This increment closes the most immediate format and integration gaps.
It does not justify calling the chain or receipt product production-ready.

The assessment uses the original recorded use cases in
[Autonomous Machines Product Vision](./autonomous-machines-product-vision.md)
and [Organisational Verification Architecture](./future-proof-organisational-verification-architecture.md).
The active source is `C:\AIChain`; the older project directory contains an
incomplete prior checkout and was not used for implementation.

## Findings and action

| Finding | Impact | Action in this increment |
|---|---|---|
| Both receipt validators require six fixed AI commitments | Ordinary apps and robots need misleading placeholders | Added general envelope, typed namespaced evidence and six profile examples |
| Domain-specific semantics need stable identification | Two integrations can interpret the same fields differently | Pin profile definition and exact specification bytes; explicitly validate shape |
| Clock/session/event lineage is absent from base AVR | Offline and machine evidence cannot describe sequence and time honestly | Optional session, sequence, predecessor, clock/uncertainty and multi-parent links; mandatory in robotics profile |
| Receipt/attestation destination is not bound in old base format | New integrations need explicit cross-destination replay boundaries | Bind chain ID and contract in general receipt/signature; reject mismatched presentations and queue destinations |
| Evidence commitment creation/opening lacks a general safe default | Guessable hashes and incompatible encodings are easy mistakes | Exact-byte commitments, random private salts, disclosure checks and streaming hashing |
| Presentation assurance is largely declarative | A supplied proof/authority reference can be overinterpreted | General receipts reject unsupported authority/ZK levels; summary marks unchecked profile/signature states |
| Anchor verifier did not check canonical block hash | Orphaned transaction data could pass confirmation counting | Require receipt hash/block hash, canonical block match and non-removed logs |
| SDK interfaces remain local prototypes | “Any developer” is stronger than the available integration evidence | Added guide, runnable example, CLI, TypeScript declarations and cross-language vectors; stable packaging remains open |

The changes are additive. Legacy receipt and presentation golden vectors still
pass. The existing standard-RPC verifier is stricter about canonical transaction
data; provider mocks/custom clients must now supply transaction/block hashes and
`getBlock(number)`, as normal Ethereum RPC providers do.

## Coverage of the original use cases

| Use case | Usable now with this format | Additional verifier or operational work |
|---|---|---|
| Enterprise AI agents | Input/output, configuration, policy, tool and approval evidence | Policy appraisal and identity integration; current ZK-001 stays on authorized AVR |
| Agent commerce | Request/authority/result packages, related receipts, replay context | Request nonce/deadline policy, live/historical authorization and settlement verification |
| Generated content | Exact artifact and external provenance manifest commitments | C2PA validation/trust policy, authorship/rights claims where required |
| AI/software supply chains | Material/process/product evidence; multiple lineage parents | External provenance validation, producer trust, completeness and traversal |
| Robotics | Configuration/authority/event evidence, stream continuity and clock identity | ROS/MCAP capture, hardware identity/attestation, protected logs and storage |
| Vehicles, drones, industrial machines | Same machine profile with distinct subject kinds | Sensor calibration, mission authority, incident retention and domain-specific assurance |
| General non-AI developers | Generic or self-defined profile; arbitrary exact-byte evidence | Their application semantics, identity and storage integration |

## Design boundaries supported by external work

IETF RATS separates device evidence from verifier appraisal and relying-party
trust. That supports carrying attestation evidence without turning a hash or
issuer signature into a “trusted robot” claim.
[RFC 9334](https://www.rfc-editor.org/rfc/rfc9334.html).

ROS 2 rosbag recording can use simulation `/clock` time. Clock source must
therefore be explicit, rather than silently labeling every sensor timestamp as
wall time. The new observation/session design follows that requirement; it does
not implement a ROS driver.
[rosbag2 documentation](https://github.com/ros2/rosbag2/blob/rolling/README.md).

C2PA already defines content assertions, manifests and signatures. The receipt
should commit that existing evidence and use its validator, not recreate its
content trust model.
[C2PA 2.4 specification](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html).

W3C credentials provide an external representation for issuer/subject claims.
They can be evidence in this format; commitment inclusion does not validate a
credential or its issuer trust.
[Verifiable Credentials 2.0](https://www.w3.org/TR/vc-data-model-2.0/).

These are architectural inputs, not claims of standards certification or
implemented interoperability adapters.

## What matters before public release

1. **Independent developer trial:** one developer outside this project must create,
   sign, store, batch, anchor, retrieve, disclose and verify evidence using only
   the guide. Include an ordinary service and a machine capture workload.
2. **Durable evidence operations:** receipt outbox, private salt retention,
   backup/restore, availability/retention policy, offline recovery, idempotent
   retries and orphan re-anchoring. Anchored hashes cannot recover lost evidence.
3. **Verifier contract:** typed results for inclusion, signature, identity,
   historical authority, profile appraisal and proof, with explicit unknown,
   unsupported, expired and revoked states. Never collapse all into “verified”.
4. **Stable SDK release:** installable versioned packages, compatibility policy,
   shared parser/negative corpus, duplicate-JSON-key rejection at ingestion,
   Go vectors, language-specific signing adapters and security review.
5. **Live general-format evidence:** exercise actual individual and batch contracts,
   canonical reorg/recovery, mixed workloads and capture-file sizes. No capacity
   or real-robot claim follows from the local tests added here.

Prioritize those five before adding new proof systems or chain features. Native
device signatures, multi-party appraisal, hardware attestation adapters and
privacy-preserving field disclosure belong after the receipt/verification
contract is stable. Autonomous control remains off-chain.

Implementation and exact protocol details:
[Developer guide](./verification-receipt-developer-guide.md).

## Validation recorded for this increment

- JavaScript SDK regression/conformance suite: **63 passed**.
- Python SDK regression/conformance suite: **51 passed**, including JSON schemas
  and matching receipt/presentation golden vectors for all six profiles.
- Offline robotics example generated and signature checked; both CLIs validated
  its pinned profile. No transaction was broadcast.
- `git diff --check` passed. Receipt conformance CI was added, but has not been
  run on GitHub as part of this local review.

The anchor integration tests use mocked standard Ethereum RPC responses. No
live robotics capture, new chain deployment or production capacity result is
claimed by these checks. Local changes remain uncommitted in `C:\AIChain`.
