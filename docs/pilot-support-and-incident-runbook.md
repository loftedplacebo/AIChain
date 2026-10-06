# Supervised pilot support and incident runbook — 5 October 2026

This is an internal procedure for the synthetic `test` pilot. It is not a
published availability promise or a production incident policy.

## Ownership and alert paths

- **Primary support and incident owner:** Michael Grant, accepted 5 October
  2026. He decides whether to pause submissions, contacts the pilot partner,
  records the incident, and authorizes resumption.
- **Backup owner:** not assigned. A partner trial should have an alternate
  contact before its start decision.
- The existing daily backup-failure heartbeat checks the 03:00 UTC encrypted
  B2 upload. A separate 30-minute heartbeat runs the read-only combined
  hosted health check and alerts Michael in the current Codex chat only when
  it fails. These are chat notifications; they do not page a phone or email a
  partner. Michael must agree the trial support window and partner escalation
  contact in the pilot brief.

## What the hosted health check covers

Run `ssh -o BatchMode=yes root@62.171.161.32 python3
/opt/aichain/governance-pilot-db-setup/check-pilot-hosted-health.py`.
It returns one JSON object and a nonzero exit status on failure. It checks:

- Pilot portal, API and evidence-worker systemd units, backup and WorkOS
  revocation-replay timers, portal/API loopback responses, at least 15% free
  disk and 10% available memory.
- Evidence-worker journal jobs: no unresolved job older than 30 minutes or
  with three or more attempts.
- The **Synthetic Validation project only**: no more than ten records awaiting
  submission and no such record older than 30 minutes. New partner projects
  require an explicit monitoring scope and worker release before access.
- WorkOS `session.revoked` replay coverage from the selected 4 October pilot
  baseline, with a maximum observed lag of five minutes. Signed webhook
  delivery remains a separate immediate path. A fresh replay watermark does
  not prove complete WorkOS history before the baseline or successful webhook
  delivery for every event.

The check deliberately does not print credentials, inspect B2 object contents,
verify a new Base transaction, or claim complete partner availability.

## First response to an alert

1. Read the failed JSON fields and confirm the check can still reach the VPS.
   Do not paste secrets, database URLs or full environment files into chat.
2. For a failed unit, inspect `systemctl status UNIT --no-pager` and the unit's
   recent journal. For evidence backlog, inspect the worker journal and the
   project's evidence status before restarting anything. For replay lag,
   inspect `orvessian-pilot-identity-replay.service` and its timer; the replay
   job is bounded and deduplicates already handled revocations.
3. If submissions could be lost, rejected repeatedly, or produce misleading
   evidence, pause ingress using the next section and tell the partner. Keep
   the incident open until a synthetic submission and relevant evidence check
   pass after the repair.
4. Record start/end times, affected scope, evidence IDs, corrective actions,
   whether data was accepted before the pause, and the partner communication.

## Emergency pause and resumption

For the current supervised pilot, stopping the API is the explicit emergency
pause for **all** ingestion. It also interrupts portal data reads and key
management; the marketing website and portal sign-in page can remain up.
This broad pause is temporary containment, not a selective production feature.

1. Pause: `ssh root@62.171.161.32 systemctl stop
   aichain-governance-synthetic-api.service`.
2. Confirm: `ssh root@62.171.161.32 systemctl is-active
   aichain-governance-synthetic-api.service` should print `inactive`. New API
   submissions should fail at the public edge; clients must retain their
   original event IDs and retry the same payload after resumption.
3. If the evidence worker itself may publish incorrect data, additionally stop
   `aichain-governance-pilot-evidence-worker.service`. Leave the worker's
   journal and database untouched. Coordinate backup timing if a pause spans
   the daily capture window.
4. After review and Michael's go decision, start any stopped worker and then
   the API with `systemctl start` for the named units. Run the combined hosted
   health check, verify `/ready`, and test one content-free submission using a
   scoped temporary key. Confirm its evidence separately before closing the
   incident.

Stopping the API does not undo records accepted earlier; the evidence worker
may continue processing them unless it is also stopped. A refined ingestion
pause that preserves reads is a future product task.

On 5 October 2026, a bounded stop/start rehearsal verified the API reached
`inactive` and loopback `/ready` stopped responding, then the API restarted
and `/ready` returned HTTP 200. The combined hosted check passed afterward:
portal/API/worker active, both timers enabled, no unresolved worker jobs, no
Synthetic Validation evidence backlog, and WorkOS replay lag under five
minutes. The rehearsal did not submit a record during the pause.

## Partner support agreement still to fill

The first partner brief must name its technical and escalation contacts,
support window, response target, pause notification method, synthetic field
allowlist, record deletion/return process and exit decision. Do not advertise
a support SLA or issue a partner credential until these are accepted.
