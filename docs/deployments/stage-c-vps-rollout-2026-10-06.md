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

At initial rollout the database contained only the Synthetic Validation
project. The second internal workspace and worker were added later the same
day, as recorded below. The two-project evidence, backup, restore and
health-detection exercises below passed. Stage C owner sign-off still needs a
supported capacity and support limit; the single-run observations below are
not a sustained load test.

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
B2 set was subsequently downloaded and restored closed, as recorded below.

The owner funded the new public relayer with 0.003 Base Sepolia ETH, above the
0.001 ETH request target. The guarded activation then reported `activated`.
Both evidence-worker units are now enabled and active. The combined hosted
check and backup health check passed with both projects and workers. No agent
record had yet been submitted to the new project at that check.

The owner ran the separately authenticated B2 restore command at hidden
prompts. Backup `152a7aae-0ba1-4b20-a90a-54b823f3c6b2` was discoverable,
downloaded and authenticated. Both registered worker journals restored and
passed identity checks. A new database `gov_restore_b2_c308eaf13583` passed
the closed PostgreSQL review with access revoked and service activation
disabled. The same-cluster timed drill took 9.38 seconds overall, including
1.53 seconds for B2 download/authentication and 7.51 seconds for restore and
review. A subsequent read-only check found both worker units, API, portal,
backup health and combined hosted health passing. This does not establish a
lost-cluster recovery time or activate the restored service.

## Periodic agent scope check

The separate 48-hour Base Sepolia watcher is active and had recorded two
events on 6 October:
`watch-98d9051c-c15f-4b4d-a72d-937bc626bb9b` and
`watch-8c1fa381-97fa-4d6c-ba74-a2e374f435da`. Read-only scoped database
checks found both in the operator's Synthetic Validation project and neither
in the new SDK Receipt Smoke Test project. Independent evidence verification
for both returned `verified`: valid trusted recording signatures, matching
record commitments, valid batch membership and confirmed Base Sepolia
transactions. The corresponding transaction hashes were
`0xc5f3665cdd69817dd475ae19a1fb359984950d7217742703d086daa8255b0430`
and `0x1f1339a1fb9fec2acf606b1325ea273bbf132de132febe12e67f9e35e4989919`.
This proves the operator-project watcher path; it does not exercise the new
project's worker or meet the two-project concurrent evidence gate.

## New-project agent evidence

A separate one-run agent used the internal project's short-lived write-only
key while the original 48-hour operator watcher remained active. Its event
`watch-33cd3da9-07e1-480a-ac85-573221fac079` appeared only in
`prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c`, not in the operator project.
Independent verification returned `verified`: valid trusted recording
signature, matching record commitment, valid batch membership and 15 Base
Sepolia confirmations at the check. The transaction was
`0xd376af04557c91e2defc83d720d5ffebe6ea75ec7ff1f260fa045a463d1471dd`.
Both hosted workers and project-wide health remained healthy. A repeat start
of the one-run service emitted only `one-shot-complete` with accepted count 1;
it made no second model call or submission.

Coordinated encrypted backup `5d5737b4-8961-4494-9816-642220d7f6cd`
completed after this event, stopping and restarting both active workers. The
version-2 backup health check passed with both journal roles. The owner then
used the separate B2 restore credential at hidden VPS prompts. The populated
set was discoverable, downloaded and authenticated; both registered worker
journals were restored and closed. Fresh database
`gov_restore_b2_c1e41b11b58a` passed the hosted PostgreSQL review with
access revoked and service activation disabled. The same-cluster drill took
12.32 seconds overall, including 1.57 seconds for B2 download/authentication
and 9.84 seconds for fresh restore and review. This does not establish
lost-cluster recovery time.

## Health detection and resource snapshot

Stopping either registered worker made the project-wide hosted health check
fail; restarting each restored green health. A read-only drill injected a
summary for the internal worker with one unresolved job aged 1,801 seconds
and three attempts into the runtime checker. It returned `healthy: false` and
`workerJournalHealthy: false`. An immediate normal check returned
`healthy: true`, with both worker journals at zero unresolved jobs, both
units active, API and portal loopback HTTP 200, 90% disk free and 96% memory
available. The registered legacy and internal worker units showed about
40.8 MB and 32.2 MB `MemoryCurrent` respectively. This validates the
checker's threshold, not delivery of an actual heartbeat notification or
behavior under sustained multi-project load. The owner heartbeat runs the
combined check every 30 minutes; backup health is checked daily. Michael Grant
is the accepted primary pilot alert and support owner; an alternate is not yet
assigned. A supported pilot project count, workload ceiling and
evidence-latency target still need to be recorded before Stage C owner
sign-off.

The Codex runtime heartbeat's saved schedule was checked after the drill: it
had been set to one 18:30 run per day despite its 30-minute prompt. It was
corrected to `FREQ=MINUTELY;INTERVAL=30` and targeted to the current owner
chat. The daily backup-failure heartbeat was also targeted to that chat, with
its 05:30 schedule preserved. The exact combined health command used by the
runtime heartbeat returned green after these changes: two registered
projects/workers, zero awaiting submissions, fresh revocation coverage and
no missing projects or unresolved worker jobs. These checks confirm the saved
automation configuration and command result, not an observed alert delivery.

## Two-project capacity smoke, 6 October

Run `20261006-a` completed in both transient load units with exit status zero.
Each project accepted ten distinct SDK receipts at six-minute intervals; the
unit logs show ten accepted and a completion event, with no rejected write.
Independent read-only verification checked each receipt's trusted recording
signature, record commitment, batch proof and confirmed Base Sepolia
transaction. All 20 passed. The internal project's maximum receipt-to-mined
time was 31 seconds. Nine operator receipts took at most 52 seconds; the
final operator receipt took 380 seconds. It remained durably batched while the
worker returned `rate-limited`, then submitted at 20:51:43 UTC and verified
after the rolling-hour limit cleared. The operator worker has a policy cap of
ten signed transactions in any rolling hour, and its separate watcher also
uses that budget. The draft proposal of ten test receipts per project per
hour is therefore withdrawn. The proposed supervised ceiling is eight new
receipts per project per rolling hour, with headroom for the watcher and
recovery. It is an operating inference for owner review, not a sustained-load
claim or an enforced API quota.

After final verification, hosted health reported two healthy projects and
workers, zero awaiting evidence, zero unresolved worker jobs, fresh
revocation coverage, API and portal loopback HTTP 200, 90% free disk and
95.9% available memory. The two worker processes used 52,113,408 and
51,781,632 bytes respectively. Backup health passed with both workers
active and the latest completed B2 upload 1.26 hours old. Public relayer
balances after the run were 8,989,159,257,161,673 wei for the operator and
2,993,724,529,258,848 wei for the internal worker. The run did not include
an independent notification-delivery observation or a post-load closed B2
restore; the populated two-journal restore earlier in this record passed.

## Scheduled alert delivery drill

At 21:00 UTC on 6 October, the one-time Codex heartbeat ran the read-only
injected stale-evidence checker on the VPS. The checker returned
`stalled_evidence_injected_check=passed`, `healthy: false` and
`workerJournalHealthy: false` for internal role
`worker_260ea33bcf622acf411da2bb`, with one synthetic unresolved job aged
1,801 seconds and three attempts. The heartbeat posted a clearly labelled
TEST ALERT to the owner chat and was then paused. The next regular runtime
heartbeat at 21:01 UTC ran the full hosted check and stayed quiet because
both projects and workers were healthy, with zero awaiting submissions and
zero unresolved worker jobs. This proves the chat heartbeat's injected alert
delivery and healthy silence; it does not prove an out-of-band page or a real
incident response. Michael Grant remains the named primary pilot support and
alert owner. His proposed workload-envelope sign-off is still pending.
