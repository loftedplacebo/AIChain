# Blockscout Compatibility Spike

| Field | Value |
|---|---|
| Status | Phase 1A compatibility assessment |
| Document version | 0.1 |
| Last updated | 2026-08-22 |
| Scope | Private development-network explorer only |
| Decision state | No explorer deployment or public exposure has been selected |

## 1. Purpose

Assess whether a Blockscout deployment can index the private EVM-compatible development network without changing its RPC privacy boundary or interfering with existing VPS services. This is an integration spike, not an endorsement of a production explorer architecture.

## 2. Observed VPS Preconditions

| Check | Observed result | Implication |
|---|---|---|
| Docker engine | Installed | Containerized evaluation is feasible |
| Available memory | Approximately 45 GiB | Sufficient for a constrained development spike |
| Available disk | Approximately 227 GiB | Sufficient for a development database and index data, subject to monitoring |
| Node RPC | Node 1 at `127.0.0.1:8545` | Explorer must preserve localhost-only RPC access |
| Host PostgreSQL | Already listening on `127.0.0.1:5432` | Do not bind a Blockscout database to the default host port or alter the existing service |
| Public explorer port | Unallocated at assessment time | Any future UI exposure is a separate firewall and access-control decision |
| Docker Compose | Installed during the spike setup | Meets Blockscout's self-hosting prerequisite |

## 3. Safe Evaluation Boundary

A future spike may run Blockscout and a **separate** PostgreSQL database in an isolated container network, with the database port unexposed on the host. The explorer should access Node 1 through a localhost-preserving configuration and should initially bind any UI to loopback or an authenticated reverse proxy.

The versioned `deploy/blockscout/compose.aichain.yml` override is used with Blockscout's official `geth.yml` template. It binds only the proxy UI to `127.0.0.1:4000`, does not publish either database, uses chain ID `20260818`, and disables trace-dependent/pending-transaction indexers for the current RPC profile. Node 1's RPC stays bound to `127.0.0.1:8545`; a dedicated relay listens only on the Blockscout Docker network's private gateway at port `18545` so the explorer containers can reach it. The optional user-operation indexer is excluded because this development node does not expose a normal WebSocket RPC endpoint. Runtime database passwords and `SECRET_KEY_BASE` are generated in the ignored `/opt/aichain/.env.blockscout` file.

For this private relay, Node 1 must accept the relay's `Host: host.docker.internal` header while remaining loopback-bound. Start it with `HTTP_VHOSTS=localhost,host.docker.internal`; this is a host-header allow-list change, not a public JSON-RPC exposure.

The deployment remains a compatibility spike. Before any broader use, record the exact Blockscout release/image digest, observed Core-Geth JSON-RPC compatibility, resource limits, volume/reset policy, and selected UI access model. Public exposure remains **TBD**.

## 4. Private Deployment Commands

On the VPS, after the official Blockscout source templates have been cloned to `/opt/aichain/services/blockscout-source`:

```bash
cd /opt/aichain
bash ./scripts/create-blockscout-runtime-env.sh
bash ./scripts/start-blockscout-spike.sh
bash ./scripts/check-blockscout-spike.sh
```

Access the private UI through an SSH tunnel only:

```powershell
ssh -N -L 4000:127.0.0.1:4000 root@62.171.161.32
```

Then browse to `http://127.0.0.1:4000`. Do not open port `4000` in UFW or the provider firewall.

## 5. Acceptance Checks

- Index chain ID `20260818`, blocks, transactions, and receipts from Node 1.
- Display the AVR anchor and batch-anchor contract events as ordinary EVM logs.
- Remain functional after node recovery and peer reconnection.
- Do not expose node JSON-RPC or database ports publicly.

## 6. Open Decisions

| ID | Decision | Status |
|---|---|---|
| EXP-001 | Blockscout version/image and compatibility result | TBD |
| EXP-002 | Explorer UI access model and authentication | TBD |
| EXP-003 | Indexer retention, reset, backup, and monitoring model | TBD |
| EXP-004 | Receipt-specific indexing/display beyond ordinary EVM events | TBD |

## 7. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-22 | Initial VPS compatibility assessment and safe evaluation boundary |
| 0.2 | 2026-08-22 | Added localhost-only Compose override and private runtime configuration workflow |
