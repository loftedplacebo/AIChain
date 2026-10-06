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

Hosted Stage C exit is still open. At the time of this rollout the database
contained only the Synthetic Validation project. The next independent
synthetic workspace must be created through the admitted-user journey, then
given a reviewed project worker request, a separate funded Base Sepolia
relayer, and a successful activation. Submit concurrent evidence in both
projects, run a new coordinated upload containing both journals, and download
and review a closed restore with the separate B2 restore credential. Exercise
the stale-evidence threshold and record capacity and owner support limits
before calling the two-project acceptance complete.
