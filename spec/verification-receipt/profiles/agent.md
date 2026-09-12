# Agent activity profile 0.4.0-alpha

Subjects: `core:agent` or `core:service`. Required exact-byte evidence packages:
`ai:configuration` describes runtime, model/provider and tool versions as applicable;
`ai:input` records task inputs; `ai:output` records results;
`ai:policy` records the policy version and relevant approval context.
Optional roles can separate model, provider, tool calls, approvals and evaluations.
Model/provider fields are not mandatory for non-model automation.
Stream/observation fields are optional. Link preceding activity with `core:parent`.

Assurance: evidence binding only; this does not prove inference correctness,
policy execution or authorization. A dishonest agent can fabricate a consistent
record or omit tool calls. Keep prompts, outputs, policies, credentials and salts
private. Independently verify profile/specification hashes, evidence openings,
signatures, chain inclusion and policy-specific contents. Use the existing
authorized AVR/ZK-001 flow for its supported policy proof; this general profile
does not inherit that proof's semantics.
