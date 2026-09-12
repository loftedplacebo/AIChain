# Generic evidence profile 0.4.0-alpha

Purpose: commit evidence from any application without AI-specific fields.
Any namespaced subject kind is accepted. `core:evidence` commits an exact-byte
application evidence package. Additional namespaced evidence roles are permitted.
Event identity, type and claimed recording time are required; streams and
observation clocks are optional. Receipt links identify related receipts.

Assurance: this profile establishes evidence shape only. A signature establishes
control of the receipt issuer key when independently verified. Neither establishes
the truth of evidence, credentials, execution, completeness or current authority.
Keep evidence, identity mappings and salts in access-controlled off-chain storage.
An adversary may fabricate or omit records, withhold evidence, or lose signing keys.
Verify the pinned profile and this specification's SHA-256, receipt hash, evidence
openings, issuer signature where required, and canonical chain inclusion separately.
The relying application supplies its own content validation and trust policy.
