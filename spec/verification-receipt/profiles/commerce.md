# Agent commerce profile 0.4.0-alpha

Subjects: `core:agent` or `core:service`. `commerce:request` commits the exact
request, counterparty, intended operation and application nonce/deadline;
`commerce:authority` commits credentials, delegation and limits;
`commerce:result` commits the outcome or settlement reference. These details live
inside off-chain evidence packages. Optional roles carry quotes, approvals and
counterparty signatures; related receipts use `core:parent` or `core:caused-by`.
Stream/observation fields are optional.

Assurance: the receipt is an audit record, not permission to spend or execute.
Replay, stale/revoked delegation, wrong counterparty and false settlement claims
remain threats. The consumer must check request freshness/idempotency, credentials,
historical/current authority as appropriate and settlement independently. Check
profile/specification hashes, evidence openings, issuer/counterparty signatures
and canonical inclusion separately. Keep terms, identities, limits and salts
private. No built-in commerce authorization or settlement adapter is provided.
