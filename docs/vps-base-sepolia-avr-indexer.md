# Base Sepolia AVR indexer on the VPS

| Field | Value |
|---|---|
| Status | Installed and enabled; 22+ hours of continuous indexing checked, with live RPC failover passing |
| Target | Existing Contabo VPS `62.171.161.32` |
| Chain | Base Sepolia, chain ID `84532` |
| Service | `aichain-base-sepolia-avr-indexer.service` |
| State | `/var/lib/aichain-base-sepolia-indexer/avr-event-index.json` |
| Last updated | 2026-09-24 |

## Design and isolation

The indexer is a read-only process that follows the deployed AVR batch anchor
contract on Base Sepolia. It validates the network and deployed bytecode, finds
the contract creation block from the known deployment transaction, indexes
canonical events in ranges of up to 1,000 blocks, saves block-hash checkpoints,
and rebuilds its derived index if a checkpoint reveals a reorganisation.
Base Sepolia remains the authority; this JSON file is disposable derived state.

The indexer is installed under `/opt/aichain/base-sepolia-indexer`, with state
in `/var/lib/aichain-base-sepolia-indexer`. It runs under its own dedicated
unprivileged `aichain-indexer` account and has no listener or signing key. The
systemd unit is separate from
`aichain-base-sepolia-synthetic-ingress.service`. It does not touch the
ingress queue, the ingress environment file, its 8787 loopback listener, or the
24-hour ingress soak. No firewall changes are needed.

The initial VPS sync should start from contract deployment at block
`47,085,379`, catch up to the VPS run's live Base Sepolia head, then poll every
15 seconds. It uses the Base and PublicNode public Sepolia RPCs as failover.
They are rate-limited development endpoints; sustained service should move to
an independently provisioned HTTPS RPC endpoint, configured through a
root-owned systemd drop-in. Do not put an endpoint credential in the bundle.

The current service produces structured status and retry lines in the
systemd journal. It does not expose a query API. Website/dashboard integration
still needs an authenticated API design, storage/API boundary, access control,
rate limits, and separate deployment review.

## Bundle

The minimal runtime bundle is in `deploy/base-sepolia-indexer`. It contains the
worker, the shared durable index implementation, and a package manifest with
only `ethers` pinned to `6.16.0`; it excludes the rest of the monorepo and the
workstation's local index and manifests.

To stage files over SSH once the workstation has network access and an
authorised SSH identity for the documented host:

```powershell
$stage = Join-Path $env:TEMP 'aichain-base-sepolia-indexer'
New-Item -ItemType Directory -Force -Path "$stage\scripts", "$stage\sdk\typescript" | Out-Null
Copy-Item C:\AIChain\scripts\base-sepolia-avr-indexer.cjs "$stage\scripts\"
Copy-Item C:\AIChain\sdk\typescript\avr-event-indexer.js "$stage\sdk\typescript\"
Copy-Item C:\AIChain\deploy\base-sepolia-indexer\package.json "$stage\"
scp -r $stage\* root@62.171.161.32:/tmp/aichain-base-sepolia-indexer/
scp C:\AIChain\deploy\systemd\aichain-base-sepolia-avr-indexer.service root@62.171.161.32:/tmp/
```

Then install the files and start the isolated unit:

```sh
set -eu
install -d -o root -g root -m 0755 /opt/aichain/base-sepolia-indexer
getent passwd aichain-indexer >/dev/null || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin aichain-indexer
install -d -o aichain-indexer -g aichain-indexer -m 0700 /var/lib/aichain-base-sepolia-indexer
install -d -o root -g root -m 0755 /opt/aichain/base-sepolia-indexer/scripts /opt/aichain/base-sepolia-indexer/sdk/typescript
install -o root -g root -m 0644 /tmp/aichain-base-sepolia-indexer/package.json /opt/aichain/base-sepolia-indexer/package.json
install -o root -g root -m 0644 /tmp/aichain-base-sepolia-indexer/scripts/base-sepolia-avr-indexer.cjs /opt/aichain/base-sepolia-indexer/scripts/
install -o root -g root -m 0644 /tmp/aichain-base-sepolia-indexer/sdk/typescript/avr-event-indexer.js /opt/aichain/base-sepolia-indexer/sdk/typescript/
cd /opt/aichain/base-sepolia-indexer
/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/npm install --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false
install -o root -g root -m 0644 /tmp/aichain-base-sepolia-avr-indexer.service /etc/systemd/system/aichain-base-sepolia-avr-indexer.service
systemctl daemon-reload
systemctl enable --now aichain-base-sepolia-avr-indexer.service
```

## Verification and rollback

After installation:

```sh
systemctl is-active aichain-base-sepolia-avr-indexer.service
systemctl is-active aichain-base-sepolia-synthetic-ingress.service
systemctl --no-pager --full status aichain-base-sepolia-avr-indexer.service
journalctl -u aichain-base-sepolia-avr-indexer.service -n 30 --no-pager
stat -c '%U:%G %a %n' /var/lib/aichain-base-sepolia-indexer/avr-event-index.json
```

The index state should report chain ID `84532`, `startBlock` `47085379`, a
monotonically advancing `nextBlock`, and recent block-hash checkpoints. The
first scan takes longer than subsequent 15-second incremental polls. Confirm
the existing ingress service remains active before and after installation.

To stop and roll back only the indexer service:

```sh
systemctl disable --now aichain-base-sepolia-avr-indexer.service
rm -f /etc/systemd/system/aichain-base-sepolia-avr-indexer.service
systemctl daemon-reload
```

Keep the state directory for diagnosis or delete it only when intentionally
discarding the derived index. Do not stop or remove the ingress unit as part of
this rollback.

## VPS deployment verification — 2026-09-23

The separate unit was installed and enabled at 22:32 CEST. It runs as
`aichain-indexer`, uses the existing Node `v24.21.0` runtime and remains
loopback-free (there is no listening socket). Systemd reports the service
active with a 512 MiB memory ceiling and 100% of one CPU core. No firewall
rule or existing unit was changed.

The first logged sync completed in 64 seconds. It verified Base Sepolia chain
ID `84532`, the expected anchor contract and both public HTTPS RPC endpoints;
indexed 128,257 blocks from creation block `47,085,379` through block
`47,213,635`; found all nine batch anchor events; and reported
`reorged: false`. The following 15-second polling cycles indexed new blocks
and continued reporting `reorged: false`. The latest inspected cursor was
`nextBlock: 47,213,858`, with 150 range checkpoints after the dedicated-account
restart resumed from the saved cursor. State is owned by
`aichain-indexer` with mode `0600`.

The existing synthetic ingress remained active before, during and after
installation. Its `/health` endpoint continued to return `status: ok`,
`mode: synthetic-only`, and the pre-existing 3,750 queued/retained synthetic
records. The current ingress soak was not altered.

No batch manifests were supplied to the VPS indexer (`manifestsAttached: 0`),
so the service currently indexes canonical anchor metadata but cannot yet
resolve a receipt ID to a batch Merkle proof. That requires an approved private
manifest source and is a separate data-access integration. The service has no
query API; it is not yet connected to the website.

The test suite passed all 10 indexer tests locally before deployment, including
range commits, restart cursor behavior, canonical block checks and orphan
removal after a reorganisation. The VPS's follow-up polls confirm live resume;
they do not constitute a 24-hour availability or provider-rate-limit soak.

At the 2026-09-24 21:21 CEST check, the service had remained active since
2026-09-23 22:39 CEST. Its cursor was `47,254,704`, with 5,321 checkpoints
and nine indexed batch events. Journal inspection since the current process
started found no RPC retries or reorganisation records; it was advancing about
eight blocks per polling interval. Systemd records five historical restarts
from the initial account-isolation change, but none since the current process
became active. The first full 24-hour continuous run since that final restart
is due at 22:39 CEST on 2026-09-24.

RPC failover was exercised on the VPS with a one-shot partial-history scan: a
deliberately unreachable first endpoint (`127.0.0.1:1`) failed, the healthy
Base Sepolia endpoint was selected, chain ID and bytecode checks passed, and
2,324 blocks were indexed with `reorged: false`. The temporary state file was
removed after the check. Monitor checkpoint/state-file growth during the
24-hour run: the JSON index retains a checkpoint per polling cycle and needs
compaction before long-term production operation.
