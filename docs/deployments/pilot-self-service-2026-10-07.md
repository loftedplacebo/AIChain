# Pilot self-service rollout — 7 October 2026

Scope: the hosted **test** pilot, synthetic data, Base Sepolia, and five total
projects. This record does not authorize production data or a paid launch.

## Installed and verified

- The owner chose open verified-user sign-up for the pilot and a dedicated
  Base Sepolia funder. Its public address is
  `0x4dF087a7622a7EEB318621c9e894fedF272a2b8F`; the protected private
  key remains on the VPS. The confirmed starting balance is 0.01 test ETH.
- The root-owned policy limits the pilot to five total projects and targets
  0.001 test ETH per project. A two-minute systemd timer checks the privileged
  project catalog, provisions at most one missing project each pass, assigns
  an isolated worker and keypair, synchronizes public receipt signer trust,
  funds its relayer through a write-ahead signed transaction journal, activates
  the worker, and requires coordinated backup coverage. Protected request
  files and funding journals make retries idempotent.
- The timer is active. A fresh portal-created internal project,
  `prj-2e7bb2dd-b180-49f6-9083-22b84b402b66`, exposed an incorrect worker
  database input path and a file-mode mismatch under the service's restrictive
  umask. Both were corrected. Its relayer was funded, its isolated worker was
  activated, public signer trust was synchronized, and a new coordinated B2
  upload covers all three journals. The combined pilot health check reports
  three of three workers active, no evidence backlog, and no pending projects.
- A database trigger now enforces five total projects before insertion. The
  API has the matching clean capacity error handler. A transaction-rolled-back
  probe filled the counter to five, verified that a sixth insertion was denied,
  and confirmed the live counter returned to three. The read-only health check
  compares that counter with the privileged project catalog and funding balance.
- The new project accepted `self-service-acceptance-6490f75f73587f9bdf0b2b8bac555ccc`.
  Its isolated worker submitted one receipt. The portal showed that exact
  event, a valid recording-service signature, a valid one-receipt batch proof,
  and Base Sepolia L2 confirmation. All three workers remained active with no
  evidence backlog. Edge blocked the portal download, but a separate read-only
  verifier loaded the record and evidence through the restricted database role
  and reported `exportVerification=verified`, `signature=valid`, trusted signer,
  exact record commitment, valid batch membership, and 323/12 Base Sepolia
  confirmations. The acceptance API key was subsequently revoked; a
  restricted-role read-back reported `acceptanceKeyStatus=revoked`. No
  credential or private key appeared in the verifier output.
- The API open-pilot admission setting, portal build, and WorkOS pilot AuthKit
  sign-up are active. WorkOS reports `allowSignUp=true`, waitlist disabled,
  required MFA, and required email verification. The public portal sign-up
  endpoint redirects to this pilot WorkOS client with `screen_hint=sign-up`.
  An initial API startup check still required the legacy admission list;
  its fix was tested and deployed. A portal release readiness race was also
  corrected. The combined hosted health check passed after both corrections.

## Acceptance sequence still required

1. Exercise a fresh account's first workspace/project journey. The database
   capacity boundary itself passed a rollback-only probe; a browser/API 429
   response under a full live quota remains unexercised.

On 8 October, the owner requested reuse of the existing secondary test email.
Its old WorkOS user had no organization memberships or user API keys, and the
pilot directory reported no workspace memberships or projects. The WorkOS
user was deleted and no longer appeared in the pilot user list. Its orphaned
local identity was disabled, invalidating old portal sessions while retaining
the audit row. A new sign-up with that email is the remaining first-account
acceptance check.

The pilot continues to use the previously supervised rate of eight new
receipts per project per rolling hour and a 30-minute evidence target until
more project capacity is measured. The backup restore evidence so far is a
same-cluster closed drill, not replacement-cluster recovery.
