# Stage C pilot VPS rollout — 6 October 2026

The multi-project worker, backup and monitoring build from `6cba175` was
installed on the synthetic `test` pilot VPS. Replaced source files were copied
to `/opt/aichain/stage-c-pre-20261006` before install; the reviewed source
bundle was retained at `/opt/aichain/stage-c-source-20261006`. No existing
worker key, journal, or API configuration was replaced. The legacy worker was
registered in root-owned mode-0600 `/etc/aichain/pilot-workers.json` and kept
running. The project worker systemd template passed `systemd-analyze verify`.

Read-only acceptance after install:

- The runtime check passed with API, portal, legacy evidence worker, backup
  timer and identity replay timer active. API `/ready` and portal `/workspace`
  returned 200 on loopback.
- The privileged catalog comparison found one database project and its one
  registered worker, with no missing project or stale worker.
- A coordinated encrypted B2 upload completed under backup ID
  `70178d23-8536-4857-8fc2-a0bfd055113c`. The protected completion pointer
  is version 2 with `journalRoles: ["worker"]`; the backup health check passed.
- The combined hosted check passed with zero records awaiting submission and
  fresh WorkOS revocation replay coverage.
- Stopping the legacy worker made the runtime check return `healthy: false`
  with the missing worker unit. Restarting it restored `healthy: true`.
- The existing owner heartbeat was updated to run the combined project-wide
  check every 30 minutes and alert only on failed health or coverage. This is
  chat alerting, not a phone paging service.

Hosted Stage C exit is still open. At initial rollout the database contained
only the Synthetic Validation project. The second internal workspace and
paused worker were added later the same day, as recorded below. Its separate
Base Sepolia relayer was subsequently funded and activated. Submit concurrent
evidence in both projects, then run a coordinated upload with their active
journals and download and review a closed restore with the separate B2 restore
credential. Exercise the stale-evidence threshold and record capacity and
owner support limits before calling the two-project acceptance complete.

## Internal synthetic project added later on 6 October

The owner created workspace `org-61f98eac-1218-439d-9e93-f3717e1dfe37`
and project `prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c` through the portal.
The privileged catalog check observed exactly those two projects and flagged
the new one as missing a worker before provisioning. A root-only request with
the documented bounded policy and 0.001 Base Sepolia ETH funding target
prepared project role `worker_260ea33bcf622acf411da2bb`. Its separate
journal and keys have private ownership and permissions; its systemd unit is
disabled/inactive by design. Repeating provisioning returned
`already-provisioned`. Its public signer is
`0x429487B3e5f6Bd51CF5555dc92aFB69Db42eb3a7`; its public relayer is
`0x96c5f9DAE27eCCE5Ed57062caf3Ba62a174C7210`. A read-only chain query
found chain 84532, fee quote below the configured cap, and zero relayer
balance. No funding or transaction was sent.

The first combined check incorrectly treated a paused unit's `systemctl`
`inactive` response as unavailable because the command exits nonzero. The
runtime and backup checks now retain stdout for that expected state. Five
focused Python tests passed on the VPS; combined health then passed with two
registered projects, one active worker and one paused worker. A coordinated
encrypted B2 upload completed as
`152a7aae-0ba1-4b20-a90a-54b823f3c6b2`; its version-2 pointer lists
`worker` and `worker_260ea33bcf622acf411da2bb`. Backup health passed. The
B2 set has not yet been downloaded and restored closed.

The owner funded the new public relayer with 0.003 Base Sepolia ETH, above the
0.001 ETH request target. The guarded activation then reported `activated`.
Both evidence-worker units are now enabled and active. The combined hosted
check and backup health check passed with both projects and workers. No agent
record had yet been submitted to the new project at that check.
