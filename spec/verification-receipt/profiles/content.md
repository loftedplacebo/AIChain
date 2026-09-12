# Content provenance profile 0.4.0-alpha

Subject: `core:artifact`. `content:artifact` commits exact asset bytes;
`content:provenance` commits its provenance package (for example a C2PA manifest).
Optional roles can commit source assets, license records and generation settings.
Use `core:derived-from` links for source receipts. Streams and clocks are optional.
Do not rewrite an existing content standard's signing or serialization rules.

Assurance: proves neither authorship, ownership, truth nor authenticity of a scene.
An issuer may attach a fabricated provenance package or omit source material.
Verify profile/specification hashes, evidence openings, receipt signatures and
canonical inclusion. Appraise external manifests with that format's validator
and trust policy, including its actual asset binding. No C2PA validator is included
in this profile. Keep unpublished assets, source data and salts private; a receipt
or hash does not make the underlying asset publicly available.
