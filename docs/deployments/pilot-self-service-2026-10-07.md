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
- The timer is active, and its first run with the two existing projects
  succeeded. The read-only self-service health check reports two projects,
  zero pending, an active timer and adequate wallet balance. The combined
  pilot health check also reports healthy.
- The API's open-pilot auth code has been deployed and restarted while the
  existing exact-email admission list remains in force. WorkOS sign-up and
  waitlist settings remain closed. The new portal build and reversible API
  admission switch are staged but not active.

## Acceptance sequence still required

1. Reauthenticate the owner's portal session and create an internal synthetic
   project through Settings. Verify the worker, funding, signer, backup and
   combined health checks for its new project ID.
2. Submit and independently verify one synthetic receipt in that project;
   confirm portal read-back and isolation from the existing two projects.
3. Apply the reversible API open-pilot switch, activate the staged portal
   build, then turn on WorkOS sign-up and disable its waitlist in the pilot
   environment. Verify the provider settings, signed-out portal copy and
   health checks.
4. Exercise a fresh account's first workspace/project journey and a capacity
   boundary. A project limit must fail cleanly before issuing a project that
   cannot receive a worker. The current reconciler stops after five projects,
   but the API does not yet reject project creation at that global boundary.

The pilot continues to use the previously supervised rate of eight new
receipts per project per rolling hour and a 30-minute evidence target until
more project capacity is measured. The backup restore evidence so far is a
same-cluster closed drill, not replacement-cluster recovery.
