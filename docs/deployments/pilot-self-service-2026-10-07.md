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

## Fresh account acceptance

The new account's first workspace, project, isolated worker, funded relayer,
receipt and verified evidence journey passed. The database capacity boundary
passed a rollback-only probe; a browser/API 429 response under a full live
quota remains unexercised because the pilot currently uses four of five slots.

On 8 October, the owner requested reuse of the existing secondary test email.
Its old WorkOS user had no organization memberships or user API keys, and the
pilot directory reported no workspace memberships or projects. The WorkOS
user was deleted and no longer appeared in the pilot user list. Its orphaned
local identity was disabled, invalidating old portal sessions while retaining
the audit row. A new WorkOS user subsequently completed email verification and
MFA and created `Second Test Account / Second Test Project` with workspace
`org-2a00a025-c3e5-498f-9599-b7e290641baf` and project
`prj-c5526c45-2b3b-4921-a58f-edf1a1b33cf3`. The scoped directory
read-back confirmed ownership. The self-service reconciler funded and activated
the fourth isolated worker and completed a new coordinated B2 upload. Combined
health passed with four of four workers, zero pending projects, and no evidence
backlog. The new account used its own one-day project key to submit
`fresh-signup-acceptance-e68926a151e8b077dc503481f8379725`; its worker
submitted one receipt. A separate restricted-role verifier returned
`exportVerification=verified`, valid recording-service signature, trusted
signer, exact record commitment, valid batch membership and 26/12 Base Sepolia
confirmations. Customer-visible portal read-back was subsequently confirmed.

The owner found the fresh receipt after clicking Refresh, then opened its
evidence detail in the portal. The Decisions view had held an absolute end time
from before submission. Portal commits `c733a31` and `0b00c65` update the query
window on search and tab changes and add a labelled **View evidence**
button per record and refreshes Decisions every 30 seconds while the tab is
visible and the detail panel is closed. TypeScript and the standalone Node build
passed. The checksum-pinned archive
`ba889007e6b357ddf31ccef8b2a299a925d7839009d5ca434b32153fda58701e`
was deployed with a rollback script on 8 October. Public `/workspace` and
`/api/auth/status` returned HTTP 200; the portal service and combined pilot
health check passed with four of four workers and no evidence backlog. The
independent verifier then reported a valid signature, exact commitment, valid
batch membership, and 314/12 Base Sepolia confirmations. The one-day
acceptance key was still active at that read-back. The owner chose to leave this
one-day key active until its scheduled expiry on 9 October 2026 at 19:36 UTC.

The pilot continues to use the previously supervised rate of eight new
receipts per project per rolling hour and a 30-minute evidence target until
more project capacity is measured. The backup restore evidence so far is a
same-cluster closed drill, not replacement-cluster recovery.

## API key reauthentication UX — 8 October

The owner confirmed key creation works after reauthentication, but the portal
sent them to Settings and lost the in-progress key form. The backend still
requires an authentication within five minutes before any key mutation. Portal
commits `8c13222` and `add703a` now explain that check, return to API keys and the same
project after successful reauthentication, and restores the entered label,
access and expiry for review. It never automatically resubmits a mutation.
The destination and draft are held only in the current browser tab for the
redirect. The draft expires after ten minutes and is restored and removed only
after a completed reauthentication. TypeScript and the
standalone build passed. The checksum-pinned archive
`27c72bd129728e755638da4bcb478177863a29c1ca1cbc4bf1ad2446703b78ee`
was deployed with rollback; public `/workspace` and `/api/auth/status` returned
HTTP 200, and the combined pilot health check stayed green. A final narrowed
restoration release with archive hash
`0e968b7472d6ddeae155533928620eba5172714cdcf86ef3ce7aa6929dac1c37`
was deployed the same day; the portal and combined pilot health checks passed
again. The browser
reauthentication round trip still needs an operator session to confirm the
new return behavior end to end.
