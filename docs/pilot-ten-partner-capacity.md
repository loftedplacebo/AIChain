# Ten-partner pilot capacity preparation

The programme target is ten independent partner organisations. Four internal
projects currently remain in the synthetic hosted pilot, so fourteen distinct
project/worker slots are needed if those internal projects are retained. This
is a capacity target, not permission to admit ten partners at once.

## Current read-only checkpoint, 9 October 2026

- The hosted health check passed: four database projects, four active registered
  workers, no missing projects, no stale workers and no evidence backlog.
- The PostgreSQL project boundary and protected self-service policy both cap
  the pilot at five projects. One slot is free.
- The dedicated Base Sepolia funding wallet held
  `7,978,873,999,999,813` wei at the check. Ten new relayers at the current
  `0.001` test ETH target plus a `0.00005` test ETH transfer margin each would
  require `10,500,000,000,000,000` wei. The current shortfall is
  `2,521,126,000,000,187` wei. Funding can change; rerun the check.
- The latest B2 marker covered all four registered journals and the scheduled
  03:00 UTC backup window. This does not measure the time or size of a
  fourteen-journal backup.
- Offline tests now validate fourteen independent registry bindings, catalog
  coverage and completion-marker roles. The code permits at most thirty worker
  entries and thirty-two journal roles. These tests do not measure host, RPC,
  database or backup throughput.

The read-only [cohort capacity check](../deploy/governance/pilot-cohort-capacity.py)
compares the project catalog, database cap, protected policy, funding balance,
provisioning health and latest backup. It reports `throughputMeasured:false`
even when the structural checks pass. Install and run it only on the pilot VPS
from the reviewed source; it requires root because the existing checks and
policy are protected. It never changes the cap, funds a wallet or provisions a
worker.

## Admission sequence

1. Retain the current four internal projects and their signed evidence. Do not
   delete a project row, worker journal or signer merely to free a slot. The
   present catalog requires one worker per project, and the backup marker must
   list every registered journal.
2. Use the one free slot for the next supervised synthetic partner test. Record
   receipt acceptance, signature/chain proof, 30-minute evidence delay,
   unresolved backlog, service memory/disk and backup completion.
3. Before the next wave, review a bounded cap increase in both the database
   trigger row and protected self-service policy. Keep the database cap no
   higher than the measured concurrent project capacity. Recheck funding for
   every new relayer and the latest complete B2 marker after provisioning.
4. Increase in measured waves, with separate partner isolation and receipt
   acceptance for each organisation. Test simultaneous submissions and the
   coordinated backup at each larger worker count. Verify an authenticated
   restore covers every journal before accepting a larger wave.
5. Restore the 30-minute runtime/evidence alert cadence during each supervised
   submission window. The idle daily check is insufficient for the approved
   30-minute evidence target.

Project retirement needs its own retention-safe design: revoke all keys, stop
new submissions, settle the outbox, preserve historical signer verification,
retain the signed receipt and journal under backup, and make catalog/health
checks distinguish retired from active projects. The current schema and quota
count have no such state. No project deletion or quota recycling is enabled by
this capacity work.
