# Development Environments

| Field | Value |
|---|---|
| Status | Living operations guide |
| Document version | 0.9 |
| Last updated | 2026-08-19 |
| Scope | Local development network and remote development-node access |
| Network status | Private, development-only; not a public testnet |

## 1. Project Services

| Service | Location | Use | Status |
|---|---|---|---|
| Source repository | [github.com/loftedplacebo/AIChain](https://github.com/loftedplacebo/AIChain) | Public source, documentation, and change history | Configured project remote |
| Remote devnet host | `62.171.161.32` | Persistent remote development node | Baseline deployed; node running as of 2026-08-18 |

The VPS is **not** a public RPC service, public testnet, or production environment. It must hold only development data and development keys.

### Deployed Development State

The VPS currently runs the pinned Core-Geth `v1.12.23` baseline on the Phase 1A genesis (chain ID `20260818`). Its RPC endpoint is bound to `127.0.0.1:8545`. Development mining is enabled with an operator-created reward address; the node has produced blocks. The address is not recorded here because it is operational data, not a protocol decision.

### Phase 1B AVR Prototype Deployment

| Item | Value |
|---|---|
| Network | Private Phase 1A devnet, chain ID `20260818` |
| Contract | `AVRAnchor` Phase 1B prototype |
| Contract address | `0xd2997572F0Ec774B7ae8e936ae440D66a15B8372` |
| Deployment transaction | `0x86a51f2530f9959f06d7141a8bba44e0a3a64daf2e576bf3588f7ac5fd40b92e` |
| Deployer | `0xccF9f75DdbDC548eaDeF8aC3CA5EA18B10fD71CE` |
| Status | Deployed 2026-08-19; development-only; not audited or a protocol decision |

The contract anchors only a receipt identifier, commitments root, schema version, issuer account, and inclusion time. It does not validate AI execution, identity authority, signatures, timestamps, or ZK proofs. See the [AVR Prototype Specification](./avr-prototype-specification.md).

#### Submit the Sample Receipt

After updating the VPS checkout, run the committed script on the VPS:

```bash
cd /opt/aichain
git pull --ff-only
bash ./scripts/anchor-sample-avr.sh
```

The script submits the fixture at `fixtures/avr/receipt-v0.1.0-draft.json` to the contract above. It prompts privately for the existing devnet keystore password, creates a mode-600 temporary password file only for Foundry, and removes it on exit. Do not enter a raw private key, paste a password into chat, or expose the localhost RPC endpoint.

This fixture is intentionally public and carries the `unproved` assurance level. A successful transaction demonstrates receipt anchoring only; it does not prove an AI execution or settle the final AVR schema.

To anchor a different prototype receipt JSON, run:

```bash
cd /opt/aichain
bash ./scripts/anchor-avr.sh /absolute/path/to/receipt.json
```

The script derives the anchor values from the JSON through the Python SDK before it signs. The claimed receipt issuer must match the signing devnet account whenever issuer identity is part of the intended assurance claim; the current prototype reports but does not enforce that rule.

#### Ready-to-Submit Second Demo Receipt

`fixtures/avr/receipt-v0.1.0-draft-demo-2.json` is a second, non-sensitive, unproved receipt prepared for the same devnet issuer. It has a distinct receipt ID and commitments root, so it can be anchored after the first sample without triggering the duplicate-receipt guard. Its opaque commitment values are demonstration data, not evidence of a real AI execution.

```bash
cd /opt/aichain
git pull --ff-only
bash ./scripts/anchor-avr.sh ./fixtures/avr/receipt-v0.1.0-draft-demo-2.json
```

#### First Anchored Sample Receipt

| Item | Value |
|---|---|
| Receipt ID | `0x12513ac64f1855af0978a1ef8770cfda878af5e8fca6151b0f08ba76c482da73` |
| Commitments root | `0x56e5f4534cf10e7fdfe0fa466072ba996d7d8fa9896ad746895ff1ff5bd6823b` |
| Anchor transaction | `0xa70757849182611803891056d99abd46a90a8f97e7f21c437eebfd4768283802` |
| Inclusion block | `8126` (`0x2ecb0b72d42eb9b5cf90765158f7844807b9ed19319e84f0918382c4d00c0261`) |
| Receipt status | Successful (`1`) |
| Event | `ReceiptAnchored` emitted by `AVRAnchor` |

The event’s indexed receipt ID, commitments root, and issuer match the committed sample fixture and the submitting devnet account. This is the first confirmed Phase 1B end-to-end receipt anchor.

To retrieve the anchor without signing or using a password:

```bash
cd /opt/aichain
bash ./scripts/read-sample-avr-anchor.sh
```

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

The VPS host firewall permits `30303/TCP` and `30303/UDP` for P2P traffic. Any cloud-provider firewall must also permit those ports before a laptop can connect directly. Do **not** expose port `8545`; use the SSH tunnel in section 3 for RPC.

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
| 0.3 | 2026-08-18 | Recorded start of development mining and first produced block |
| 0.4 | 2026-08-19 | Recorded Phase 1B AVR anchor deployment on the private devnet |
| 0.5 | 2026-08-19 | Added repeatable sample-receipt anchoring workflow and recorded the first confirmed sample anchor |
| 0.7 | 2026-08-19 | Added read-only anchor retrieval and SDK verification workflow |
| 0.8 | 2026-08-19 | Added data-driven receipt submission workflow |
| 0.9 | 2026-08-19 | Added a distinct, ready-to-submit demonstration receipt |
