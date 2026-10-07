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
- The API's open-pilot auth code has been deployed and restarted while the
  existing exact-email admission list remains in force. WorkOS sign-up and
  waitlist settings remain closed. The new portal build and reversible API
  admission switch are staged but not active.

## Acceptance sequence still required

1. Submit and independently verify one synthetic receipt in the new project;
   confirm portal read-back and isolation from the existing two projects.
2. Apply the reversible API open-pilot switch, activate the staged portal
   build, then turn on WorkOS sign-up and disable its waitlist in the pilot
   environment. Verify the provider settings, signed-out portal copy and
   health checks.
3. Exercise a fresh account's first workspace/project journey. The database
   capacity boundary itself passed a rollback-only probe; a browser/API 429
   response under a full live quota remains unexercised.

The pilot continues to use the previously supervised rate of eight new
receipts per project per rolling hour and a 30-minute evidence target until
more project capacity is measured. The backup restore evidence so far is a
same-cluster closed drill, not replacement-cluster recovery.
