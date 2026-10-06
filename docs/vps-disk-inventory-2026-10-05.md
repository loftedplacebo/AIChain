# VPS disk inventory — 5 October 2026

The inventory below records the state before the owner-authorized cleanup later
on 5 October 2026. Sizes are rounded `du`/`df` values and may differ
slightly because of filesystem accounting and files that continue to grow.

## Capacity

The main filesystem is **242 GB total, 96 GB used, 146 GB available (40% used)**.
Inodes are 3% used. `/boot` is 15% used. The many Docker `overlay` lines in
`df` refer to the same underlying filesystem and must not be added together.
There is no current disk-capacity emergency.

| Top-level directory | Used | What it contains |
| --- | ---: | --- |
| `/opt` | 36 GB | Active AIChain/Orvessian deployments, devnet and older research trees |
| `/var` | 33 GB | Docker/containerd, system caches and logs |
| `/root` | 20 GB | SP1/Risc0/Rust/Go toolchains, caches and separate research/trading files |
| `/tmp` | 5 GB | Mainly AIChain experiment workspaces; some are still open by running nodes |
| `/usr` | 3.5 GB | Operating system and installed software |

## Retain for the hosted Orvessian pilot

- The active portal, API, worker and backup runner under
  `/opt/aichain/orvessian-pilot-portal` (85 MB),
  `/opt/aichain/governance-pilot-api` (36 MB),
  `/opt/aichain/governance-pilot-worker` (1.7 MB),
  `/opt/aichain/pilot-backup-runner` (58 MB), and
  `/opt/aichain/governance-pilot-db-setup` (136 MB). These use shared
  `/opt/aichain/.toolchains` (452 MB).
- `/var/lib/aichain-governance-pilot-worker` (4.1 MB), including its durable
  journal and private keys; `/var/lib/aichain-pilot-backup` (1.5 MB),
  including local backup state. Keep protected configuration in `/etc`, Nginx
  and TLS material, systemd units and their service accounts. Do not expose or
  remove any key or environment file.
- The DigitalOcean pilot database and Backblaze B2 archive are remote; they do
  not explain the VPS disk usage. The named local pilot services were active
  during this inspection.

## Other active AIChain services and data — retain until separately retired

- `/opt/aichain/devnet` is 13 GB. The active `core-geth` process has its
  `/opt/aichain/devnet/node-1/node.log` open; that log is 8.7 GB. Devnet DAG
  files are 2.2 GB and chain data is present. The explorer and other older
  AIChain demonstration services are separate from the hosted Orvessian pilot,
  but they are running. Do not remove their data as ordinary cleanup.
- Active Blockscout containers use Docker and containerd under `/var/lib`
  (17 GB and 11 GB respectively). Their database directories are bind-mounted
  from `/opt/aichain/services/blockscout-source` (2.6 GB); retain those data
  directories and the running images. The Blockscout backend Docker JSON log
  alone is 16.3 GB. The stats container log is 1.1 GB and that container had
  restarted more than 5,250 times during inspection. Both use `json-file`
  logging with no per-container size/rotation options.
- Several dated experimental paths are **still in use**: an `anvil` process
  has a file open under `/tmp/aichain-phase3-hSThJP` (2.6 GB); `core-geth-asert`
  processes have files open under two September `/tmp/aichain-phase4-*` trees
  and `/opt/aichain-phase4` (6.6 GB). Their age or location does not make
  them safe to delete.
- `/opt/aichain-evm-eval` (6.0 GB) and its `spikes` tree (5.8 GB),
  `/root/.sp1` (9.1 GB, mostly circuit files), `/root/.risc0` (3.2 GB), and
  `/root/.cargo` (3.2 GB) are older research/toolchain assets, not required by
  the current hosted portal. No service reference to `aichain-evm-eval` was
  found in the inspected systemd/cron locations, but its unique results and
  future use have not been reviewed. Archive or confirm retirement before
  deleting it or the toolchains.
- `/opt/aichain/node` (2.8 GB) and `/opt/aichain/.git` (1.2 GB) are the wider
  AIChain source/history, not disposable portal releases. `/opt/aichain-g3`
  (939 MB) and `/opt/aichain-3miner` (716 MB) are further experiment trees;
  their future value and process references need review before cleanup.
- `/opt/kucoin-basis-funding-arb`, `/opt/momentum`, `/opt/signal-delta`, and
  `/root/arbitrage` are separate user projects. They are not part of the
  hosted Orvessian pilot. Several KuCoin, Momentum and Signal Delta systemd
  unit files still reference these projects, even though they were not in the
  running-service list. Keep them until their own retirement is reviewed.
- `/root/.cache` (1.8 GB, mostly Go build cache), `/root/.rustup` (585 MB),
  `/root/go` (481 MB) and `/root/.vscode-server` (512 MB) support development
  rather than the running portal. Their rebuildability varies; keep unless
  deliberately clearing developer tooling.

## Reclaimable or controllable space

| Candidate | Approximate space | Assessment |
| --- | ---: | --- |
| Two Docker images with **zero containers** (`risczero/risc0-groth16-prover` and `ghcr.io/succinctlabs/sp1-gnark`) | 5.4 GB | They are not used by running containers; removal would require re-pulling for future ZK work. Use Docker image commands, never delete `/var/lib/docker` or `/var/lib/containerd` by hand. |
| APT downloaded package archives | 1.0 GB | Re-downloadable; `apt clean` would not uninstall packages. |
| Go build cache and Cargo registry | 1.7 GB + 3.2 GB | Rebuildable/re-downloadable, but may slow active development. Defer unless space is needed. |
| Netdata history cache and system journal | 2.3 GB + 1.7 GB | Retention/rotation decision; pruning loses monitoring history. |
| Active Blockscout backend, stats and devnet node logs | about 26 GB | Largest practical saving, but they are open by running processes. Diagnose the restarting stats container, set bounded log retention and rotate during a controlled maintenance step. Do **not** `rm` active log files. |
| Old `/tmp` experiment workspaces | up to 5 GB | Some have open files in running nodes. Review each process and preserve unique results before any removal. |

The safest immediate space recovery, if desired, is the two unused Docker
images plus APT archives (about 6 GB), after the owner confirms those local
artifacts are no longer wanted. The more valuable fix is **bounded log
rotation** for Blockscout and the devnet node, plus diagnosis of the stats
restart loop. No space recovery is urgent at 60% free.

## Follow-up before any deletion

1. Decide whether the older AIChain devnet, explorer, ZK research trees and
   separate trading projects should remain available. They are outside the
   hosted Orvessian pilot, but several are active or may contain unique work.
2. Configure and test log rotation without losing current diagnostics; inspect
   why Blockscout stats restarts repeatedly. Record post-change log growth.
3. If retiring an experiment, stop its owner process, preserve source and
   unique results, check bind mounts and systemd/cron references, then remove
   only its verified paths in a separate reviewed cleanup.

## Cleanup completed on 5 October 2026

The owner explicitly authorized retiring the devnet and Blockscout, including
their files and data, and removing unused Docker images and APT downloads.
Before removal, the hosted pilot health check was healthy. Blockscout's Compose
stack and separate RPC bridge were stopped and removed; the Compose images,
containers, network and volumes were removed. The two `core-geth` processes
using `/opt/aichain/devnet` were stopped. Path, mountpoint and open-file checks
preceded deletion of exactly `/opt/aichain/devnet` and
`/opt/aichain/services/blockscout-source`. The three remaining zero-container
images (`alpine/socat`, Risc0 Groth16 prover and SP1 gnark) were removed with
Docker; `apt-get clean` cleared downloaded APT archives. Docker's engine and
data directories were not deleted by hand.

After cleanup, the main filesystem was **242 GB total, 54 GB used, 188 GB
available (23% used)**: approximately **42 GB reclaimed** relative to the
96 GB baseline. `/var/lib/docker` was 252 KB, `/var/lib/containerd` 2.8 MB,
and `/var/cache/apt/archives` 20 KB. Both retired directories were absent.
The hosted pilot health check still returned `healthy: true`: portal, API,
evidence worker, backup timer and identity replay timer active; portal and API
loopback probes HTTP 200; synthetic evidence backlog and worker unresolved
attempts both zero. Its evidence coverage is limited to Synthetic Validation.

The other AIChain experiments and separate trading projects listed above were
retained. The earlier candidate and follow-up sections describe the **pre-cleanup**
inventory and should not be used as a current deletion list.

## Phase 4 and ZK retirement — completed with owner approval

Read-only review after the devnet cleanup identified this exact candidate set,
which the owner approved and which was retired on 5 October 2026:

| Path on VPS | Used | Retirement prerequisite |
| --- | ---: | --- |
| `/opt/aichain-phase4` | 6.6 GB | Stop its `core-geth-asert` node; its source clone has only generated, untracked contract build outputs. |
| `/tmp/aichain-phase4-*` | 2.2 GB total | Stop four `core-geth-asert` nodes using these datadirs; include matching small address/genesis files. |
| `/opt/aichain-evm-eval` | 6.0 GB | Preserve or explicitly discard five uncommitted ZK source edits and an untracked benchmark script before deleting its generated build trees. Its committed history is present in the local repository. |
| `/root/.sp1` | 9.1 GB | SP1 circuit cache and toolchains; no running process or hosted-service reference found. |
| `/root/.risc0` | 3.2 GB | Risc0 toolchains and extensions; no running process or hosted-service reference found. |
| `/tmp/aichain-phase3-hSThJP` | 2.6 GB | ZK/Phase 3 scratch tree; stop its active Anvil process. |
| `/tmp/aichain-zk-check.lzPMIw`, `/tmp/aichain-zk004-check` | <1 MB | ZK scratch only. |

Estimated total before removal: **about 29.7 GB**. Five Phase 4 nodes and the
Phase 3 Anvil process were running in root login
sessions, rather than dedicated systemd units. No inspected systemd/cron files
or hosted pilot and Base Sepolia service directories reference these paths.
The hosted pilot's portal, API, evidence worker and timers were healthy at
review time. Process identities, mounts, references and pilot health were
rechecked. Only the identified research processes were stopped. The five
uncommitted source edits, benchmark script and two Cargo lockfiles were saved
in [`docs/archive/2026-10-05/retire-zk-source-20261005`](archive/2026-10-05/retire-zk-source-20261005),
with SHA-256 hashes matching the VPS originals, before deletion. Exact resolved
candidate paths were removed; the temporary VPS archive copy was also removed.

After removal, the main filesystem was **242 GB total, 24 GB used, 218 GB
available (10% used)**: approximately **30 GB reclaimed** in this second
cleanup, or **72 GB** including the earlier devnet and Blockscout retirement.
The hosted pilot check again returned `healthy: true`, with portal, API,
evidence worker and timers active, HTTP 200 loopback probes, and no synthetic
evidence backlog or unresolved worker attempts. The older Base Sepolia
services were also active. The separate three-miner validator remained running.

**Excluded from this retirement:** `/opt/aichain/node`, `/opt/aichain/.git`,
`/opt/aichain/.toolchains`, the local repository's `spikes/zk-statement` source,
`/root/.cargo`, and `/root/.foundry`. They are shared source or general tooling.
`/opt/aichain-g3` (939 MB) and `/opt/aichain-3miner` (690 MB, with an active
validator) are adjacent own-chain experiments, but their names do not establish
that they are Phase 4 or ZK assets; they require an explicit scope decision.
