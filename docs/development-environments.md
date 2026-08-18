# Development Environments

| Field | Value |
|---|---|
| Status | Living operations guide |
| Document version | 0.2 |
| Last updated | 2026-08-18 |
| Scope | Local development network and remote development-node access |
| Network status | Private, development-only; not a public testnet |

## 1. Project Services

| Service | Location | Use | Status |
|---|---|---|---|
| Source repository | [github.com/loftedplacebo/AIChain](https://github.com/loftedplacebo/AIChain) | Public source, documentation, and change history | Configured project remote |
| Remote devnet host | `62.171.161.32` | Persistent remote development node | Baseline deployed; node running as of 2026-08-18 |

The VPS is **not** a public RPC service, public testnet, or production environment. It must hold only development data and development keys.

### Deployed Development State

The VPS currently runs the pinned Core-Geth `v1.12.23` baseline on the Phase 1A genesis (chain ID `20260818`). Its RPC endpoint is bound to `127.0.0.1:8545`, and it is intentionally **not mining** until an operator creates a private mining account. This node has no pre-funded account and has produced no blocks yet.

## 2. SSH Access

Connect using the existing SSH key or configured SSH authentication:

```powershell
ssh root@62.171.161.32
```

The current account is `root`. This is appropriate only for initial provisioning. Before exposing any non-local service, create a restricted operator account, disable password-based root login, use SSH keys only, and apply host firewall rules.

Do not put SSH private keys, passwords, seed phrases, keystore passwords, or RPC credentials in Git, scripts, terminal history, or documentation.

## 3. Remote RPC Access

The node scripts bind JSON-RPC to `127.0.0.1`, not the public interface. Access it from a local machine through an SSH tunnel:

```powershell
ssh -N -L 8545:127.0.0.1:8545 root@62.171.161.32
```

While the tunnel is active, local tools can use `http://127.0.0.1:8545`. Do not open port `8545` publicly during Phase 1A.

## 4. Development-Only Network Parameters

| Parameter | Value | Status |
|---|---|---|
| Chain ID / network ID | `20260818` | Temporary Phase 1A value |
| Consensus engine | Ethash PoW | Temporary baseline validation only |
| Genesis difficulty | `0x20000` | Temporary; intentionally low for development |
| Ethash mining dataset | Approximately 1 GB per node | Temporary validation cost; stored inside each node data directory |
| P2P port | `30303` | Development default |
| JSON-RPC | `127.0.0.1:8545` | Localhost-only |

These values do **not** select the eventual GPU-friendly PoW algorithm, its quantum-resilience posture, final chain ID, block policy, token economics, or public-testnet configuration.

## 5. Local Node Workflow

Build the node as described in the [README](../README.md), then create an account for development funding:

```powershell
.\build\core-geth.exe account new --datadir .\devnet\node-1
```

Record the printed public address somewhere private, then initialize a fresh data directory using it:

```powershell
.\scripts\initialize-devnet.ps1 -DataDir .\devnet\node-1 -PrefundedAddress 0xYOUR_ADDRESS
.\scripts\start-devnet-node.ps1 -DataDir .\devnet\node-1 -Mine -Etherbase 0xYOUR_ADDRESS
```

The first command creates a local keystore under `devnet/`, which Git ignores. The initialization script will refuse to overwrite an existing chain database, preventing accidental genesis replacement.

When mining starts for the first time, Ethash creates a large local dataset. The script keeps it inside the selected node data directory so it is easy to identify and remove when this disposable network is retired.

## 6. VPS Node Workflow

Provision the pinned Linux build using the committed script:

```bash
git clone https://github.com/loftedplacebo/AIChain.git /opt/aichain
cd /opt/aichain
sudo ./scripts/provision-vps.sh
```

The script supports apt-based Linux systems, initializes the pinned Core-Geth source (without its optional nested test-fixture repositories), installs the project-pinned Go `1.21.13` toolchain after checksum verification, builds the node, and does not alter SSH, firewall, or RPC exposure. Do not copy Windows `core-geth.exe` to Linux.

Create the mining account interactively on the VPS so its password is never placed in a command, repository, or chat:

```bash
/opt/aichain/bin/core-geth account new --datadir /opt/aichain/devnet/node-1
```

Record its public address privately, then initialize and start the node. The address may be used as `MINER_ETHERBASE`; it need not be pre-funded to receive mining rewards.

On the VPS, clone the repository, initialize its submodule, build the pinned source, initialize a **new** VPS data directory with the same committed genesis, and start the node with JSON-RPC restricted to localhost. Exchange the VPS node's enode through an authenticated channel before connecting a local second node.

VPS service management, firewall rules, and user hardening remain explicit operations decisions. They will be recorded once the host's operating-system baseline and access policy are reviewed.

## 7. Phase 1A Checks

1. Confirm the node returns the expected chain ID through local JSON-RPC.
2. Confirm blocks are mined on the temporary devnet.
3. Connect a second node using an authenticatedly shared enode and verify synchronization.
4. Send a funded development transaction and verify it through JSON-RPC.
5. Verify RPC stays inaccessible from the public Internet and accessible only through SSH tunnelling.

## 8. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-18 | Added public repository and private devnet/VPS operating guide |
| 0.2 | 2026-08-18 | Recorded deployed VPS baseline and non-mining devnet node state |
