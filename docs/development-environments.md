# Development Environments

| Field | Value |
|---|---|
| Status | Living operations guide |
| Document version | 1.7 |
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

The demo receipt was successfully anchored:

| Item | Value |
|---|---|
| Receipt ID | `0x39c07a30df34f2f5631bc881b7912f506d94c8a6bdfbc98eb16fe3220c62f647` |
| Commitments root | `0x6aef2c16cb3f5eca692ed17430be3901ddaec7ce858d766e377e7d6d7aa6e526` |
| Anchor transaction | `0x2256c0b1b42d147fb368744b58942bb8f6141f3894fc574885e9a5588172cadc` |
| Inclusion block | `8170` (`0x058348ca19d78d9328b93c47f8b6102affaa6f693083ce49f752fee73097f62d`) |
| Receipt status | Successful (`1`) |

This is the second confirmed anchor and validates the data-driven path from a distinct receipt JSON through SDK derivation to the deployed contract.

#### Optional Issuer Attestation

To create a separately verifiable EIP-191 signature for a receipt before or after anchoring, run:

```bash
cd /opt/aichain
bash ./scripts/sign-avr-attestation.sh \
  ./fixtures/avr/receipt-v0.1.0-draft-demo-2.json \
  /opt/aichain/devnet/demo-2.attestation.json
```

The script prompts privately for the encrypted keystore password, signs the domain-separated receipt-ID message, cryptographically verifies the result against the claimed issuer, and writes a JSON sidecar. This is an optional Phase 1B prototype feature; the deployed contract does not yet verify or store the signature.

The second demo receipt has a verified attestation sidecar:

| Item | Value |
|---|---|
| Receipt ID | `0x39c07a30df34f2f5631bc881b7912f506d94c8a6bdfbc98eb16fe3220c62f647` |
| Scheme | `eip191-personal-sign` |
| Verified issuer | `0xccF9f75DdbDC548eaDeF8aC3CA5EA18B10fD71CE` |
| Signature | `0x0d3db31c0e387956d5124d7dd5e9cdc578ffe7a0be87a4e266aee4c755db3bfe025476245a2bc66ee2e26569f2b4a3353bd6277e114b6b79dddbb1a3be6e23331c` |
| Status | Created and cryptographically verified on the VPS, 2026-08-19 |

The signature is public verification data, not a private key. The encrypted keystore and password remain only on the VPS.

### Phase 1B AuthorityRegistry Deployment

| Item | Value |
|---|---|
| Network | Private Phase 1A devnet, chain ID `20260818` |
| Contract | `AuthorityRegistry` Phase 1B prototype |
| Contract address | `0xd04D61a6A88f73400933F13A02c7974CE8d877a6` |
| Deployment transaction | `0x330e9221e3221cef3a67fa2f1f215feeb0fa02474ed693e33b0bd4bc9ab7b145` |
| Deployer | `0xccF9f75DdbDC548eaDeF8aC3CA5EA18B10fD71CE` |
| Status | Deployed 2026-08-19; development-only and unaudited |

The registry has not yet been populated. Any forthcoming organisation ID, agent address, authority commitment, and validity interval are test data until an identity, credential, delegation, and authority model is explicitly agreed.

#### Demo Organisation and Agent Delegation

The separate devnet agent wallet is `0x82F0165D1b77C69978E4127d347023680f685365`. The committed `register-demo-agent.sh` script uses the following clearly labelled demo values:

| Item | Value |
|---|---|
| Organisation ID | `0x7550d2eadaa6602b06879e581f21ec46469c1325f4a5731e7db99ea9e677141a` (`keccak256("aichain:demo-organization:phase-1b")`) |
| Authority commitment | `0x5a4e0654d0c7b9b2c8e3c40bae47e94b95b81aad794c5a7ccafa82a516b56bb4` (`keccak256("aichain:demo-authority:agent-1:v1")`) |
| Agent | `0x82F0165D1b77C69978E4127d347023680f685365` |
| Validity | Current chain timestamp through 30 days later |

To register the organisation and delegate the authority using the controller wallet:

```bash
cd /opt/aichain
git pull --ff-only
bash ./scripts/register-demo-agent.sh
```

The script prompts privately for the controller keystore password, sends two devnet transactions, and reads `isActive` afterwards. It intentionally refuses to treat the demo label or hash as a real-world identity, policy, credential, or legal authority.

The demo delegation was successfully created and confirmed active:

| Item | Value |
|---|---|
| Organisation registration transaction | `0xb080e545d3be582010f7b7f31a37a500f1be1746480404aee86a8a4608a0943f` |
| Registration block | `8243` (`0xe9e3492d0b020ea1cd4fe8a2152e70a9fc52c5ffcd9017425bfd97c6f9f6f25e`) |
| Agent authorization transaction | `0xca1926b304ae9009a2b40ec4b68f36845e8176fa5c3e8f81d5d244bddad71e87` |
| Authorization block | `8244` (`0x82c0e249d04c0fe19228beeab6b71f90f23ce4df11748a2dd321f578e691d974`) |
| Active delegation check | `true` |

The `true` result means the registry has an unrevoked delegation for the agent and current chain time lies within its recorded validity window. It does not establish real-world identity, policy compliance, or authority beyond the prototype contract's defined semantics.

#### Agent-Issued Demonstration Receipt

`fixtures/avr/receipt-v0.1.0-draft-agent-demo-3.json` is a non-sensitive receipt whose claimed issuer is the separately delegated agent wallet. The active delegation is a current-state check, not a proof of the receipt's claimed execution time. Its expected values are:

| Item | Value |
|---|---|
| Receipt ID | `0x17efa109dccbbb3275cf30a87fab1d19cd2b86913808b66fd29dcf0daa88b331` |
| Commitments root | `0xc649fcd6380e4ba3a564f27d18ca80b235f2f70bf349b9001be7f22d4714672f` |
| Claimed issuer | `0x82F0165D1b77C69978E4127d347023680f685365` |

The agent needs a small temporary balance to submit its own anchor transaction. The controller funds it, then the agent signs and anchors its own receipt:

```bash
cd /opt/aichain
git pull --ff-only

# Prompts for the controller password.
bash ./scripts/fund-demo-agent.sh

# Prompts for the separate agent password.
KEYSTORE_DIR=/opt/aichain/devnet/agent-1/keystore \
  bash ./scripts/sign-avr-attestation.sh \
  ./fixtures/avr/receipt-v0.1.0-draft-agent-demo-3.json \
  /opt/aichain/devnet/agent-demo-3.attestation.json

# Prompts for the separate agent password again.
KEYSTORE_DIR=/opt/aichain/devnet/agent-1/keystore \
  bash ./scripts/anchor-avr.sh \
  ./fixtures/avr/receipt-v0.1.0-draft-agent-demo-3.json
```

All values are development demonstration data. Do not use the resulting signature, delegation, or anchor as evidence of real-world authorization.

The authorised-agent demonstration completed successfully:

| Evidence | Value |
|---|---|
| Controller funding transaction | `0xb2eb3b71fa4aabe222bcfbe7d716517e98fe7e84d52b5345c2871c9c5d575726` in block `8261` |
| Agent receipt ID | `0x17efa109dccbbb3275cf30a87fab1d19cd2b86913808b66fd29dcf0daa88b331` |
| Agent attestation scheme | `eip191-personal-sign` |
| Agent attestation signature | `0x47b53a518cff28b487499aff2dba1fabdf51084aca2b6a18939598df40cd714c23de7e003ffd0dd2e1ad70604a66697588852f5f354db78d66a0aed4a09b35001b` |
| Signature verification | Passed for agent `0x82F0165D1b77C69978E4127d347023680f685365` |
| Receipt anchor transaction | `0x70bc1e4c42ff8d67c757540eb775b5823b85868f8b498fea0054c88fcebe48a5` in block `8264` |
| Anchor issuer | Agent `0x82F0165D1b77C69978E4127d347023680f685365` |
| Current registry `isActive` result | `true` |

The evidence establishes only the prototype claims: the agent wallet signed the defined receipt-ID message; that wallet submitted the anchor; and the registry currently reports its demonstration delegation active. It does not independently prove the claimed execution time, real-world identity, policy compliance, or legal authority.

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

## 8. Two Nodes on One VPS

A second, non-mining node can run on the same VPS for development-network synchronization, restart, and controlled partition/rejoin exercises. This is useful before the provider firewall permits an external laptop peer, but it is **not** evidence of independent-host decentralization or production network performance.

Node 2 uses a separate data directory, P2P port, and localhost-only RPC port:

| Node | Data directory | P2P | JSON-RPC | Internal engine RPC | Mining |
|---|---|---:|---:|---:|---|
| Node 1 | `/opt/aichain/devnet/node-1` | `30303` | `127.0.0.1:8545` | `127.0.0.1:8551` | Yes, development-only |
| Node 2 | `/opt/aichain/devnet/node-2` | `30304` | `127.0.0.1:8546` | `127.0.0.1:8552` | No |

First, retrieve Node 1's enode and replace its host with `127.0.0.1` for the same-machine connection:

```bash
NODE_1_ENODE=$(/opt/aichain/bin/core-geth attach --exec 'admin.nodeInfo.enode' /opt/aichain/devnet/node-1/geth.ipc | tr -d '"')
NODE_1_LOCAL_ENODE="${NODE_1_ENODE/@62.171.161.32:30303/@127.0.0.1:30303}"
printf '%s\n' "$NODE_1_LOCAL_ENODE"
```

Initialize Node 2 only once. It has no private account or pre-funded balance because it does not submit transactions or mine:

```bash
cd /opt/aichain
NODE_BINARY=/opt/aichain/bin/core-geth \
  bash ./scripts/initialize-devnet.sh /opt/aichain/devnet/node-2
```

Start it without changing host or cloud firewalls:

```bash
cd /opt/aichain
NODE_1_LOCAL_ENODE="$NODE_1_LOCAL_ENODE" \
  bash ./scripts/start-vps-second-node.sh
```

Then add Node 1 as an explicit peer and verify both peers and block heights. `admin.addPeer` is intentional here: the development scripts have discovery disabled, so the test does not depend on public discovery.

```bash
/opt/aichain/bin/core-geth attach \
  --exec "admin.addPeer('$NODE_1_LOCAL_ENODE')" \
  /opt/aichain/devnet/node-2/geth.ipc

/opt/aichain/bin/core-geth attach --exec 'admin.peers.length' /opt/aichain/devnet/node-1/geth.ipc
/opt/aichain/bin/core-geth attach --exec 'eth.blockNumber' /opt/aichain/devnet/node-1/geth.ipc
/opt/aichain/bin/core-geth attach --exec 'admin.peers.length' /opt/aichain/devnet/node-2/geth.ipc
/opt/aichain/bin/core-geth attach --exec 'eth.blockNumber' /opt/aichain/devnet/node-2/geth.ipc
```

Both peer counts should become `1` and block heights should converge. Node 2's log and PID are at `/opt/aichain/devnet/node-2/node.log` and `/opt/aichain/devnet/node-2/core-geth.pid`. To create a controlled temporary partition, stop **only** Node 2, observe it fall behind while Node 1 mines, then restart it with the same command and verify it catches up. Do not delete either data directory for this test.

This setup adds roughly another Ethash development dataset (about 1 GB) plus chain data. Check free space before initialization. It does not open `30304`, `8546`, or any additional public service.

**Validated development result (2026-08-20):** Node 2 completed an initial sync from Node 1, both nodes reported one peer and the same block height, and a controlled Node-2-only stop/restart rejoined successfully. This validates the same-host synchronization path only; it does not replace the pending cross-host P2P/firewall test.

## 9. External Laptop Peer

An external non-mining laptop node connects **outbound** to the VPS's Node 1 on `30303`. Its RPC remains on `127.0.0.1:8545`; do not expose it. The VPS need only accept P2P on `30303/TCP` and `30303/UDP`. No inbound port is required on the laptop for this initiator-side test.

From an ordinary local PowerShell session (not through an SSH tunnel), start the already-initialized laptop node:

```powershell
cd C:\AIChain

.\scripts\start-devnet-node.ps1 `
  -DataDir C:\AIChain\devnet\laptop-node-1 `
  -Port 30304 `
  -Bootnodes 'enode://80840b1a31cc14c5df6c44131084c8ce06db0f24885f730f92487901997e28ffc1d548dd7921c8778c488c2ada3392951af5ceda606f0637290307e058bd0e52@62.171.161.32:30303?discport=0'
```

With discovery disabled, explicitly add Node 1. On Windows, Core-Geth's default IPC interface is a named pipe, so use the `ipc:` endpoint rather than a filesystem path:

```powershell
& C:\AIChain\build\core-geth.exe attach `
  --exec 'admin.addPeer("enode://80840b1a31cc14c5df6c44131084c8ce06db0f24885f730f92487901997e28ffc1d548dd7921c8778c488c2ada3392951af5ceda606f0637290307e058bd0e52@62.171.161.32:30303?discport=0")' `
  'ipc:\\.\pipe\geth.ipc'
```

Check the laptop through localhost JSON-RPC or the same named-pipe endpoint, then check Node 1 through its VPS IPC. The laptop must report at least one peer and the same current block height as the VPS before it is used for transaction-relay testing.

**Validated development result (2026-08-21):** the laptop explicitly added the VPS enode, reached one peer, synchronized to block `22214`, and reported `eth.syncing = false`. The VPS reported two peers: its same-host non-mining Node 2 and the external laptop node. This is the first cross-host P2P validation. It does not establish independent consensus security because Node 1 remains the sole miner.

### Laptop Development Account

Use a dedicated, locally stored account for laptop-originated devnet transactions. Its keystore and local `.env` password file are ignored by Git; never move either to the VPS or commit them. Fund only the public address from the VPS controller account:

```bash
cd /opt/aichain
FUND_AMOUNT=1ether bash ./scripts/fund-dev-account.sh 0xLAPTOP_ADDRESS
```

The script prompts for the **VPS controller** keystore password and removes its temporary password file on exit. The receiving laptop account's password is never needed on the VPS. `1ether` is temporary development currency only; it is not a token-economics decision.

### Laptop-Originated Batch Submission

The local development helper `npm run submit:laptop-batch` decrypts the dedicated laptop keystore on the laptop only, signs a batch-anchor transaction, and submits it through the laptop's localhost RPC. It requires Node.js and the committed `ethers` dependency; `npm install` installs its ignored local modules. It reads the password only from the ignored `.env.laptop-dev` file.

```powershell
cd C:\AIChain
npm install
npm run submit:laptop-batch -- `
  0xLAPTOP_ADDRESS laptop-originated-1-YYYYMMDD 100
```

The command writes a non-sensitive report under the ignored `devnet/` directory. Verify its transaction on both VPS RPC endpoints before treating the relay test as complete. The helper is development-only: it does not define a wallet standard, custody model, submission SDK, or production key-management policy.

**Validated development result (2026-08-22):** the funded laptop address `0x871252AE9E27BDf8265402a70A0Fb04B55b64dF7` locally signed and submitted a 100-receipt batch through the laptop node. VPS Node 1 mined transaction `0x69fed2f4783e7d0811f3c50552af678c85d685f93c7d1ac7675a6385bb684828` in block `25819`; VPS Node 2 returned the identical successful receipt. This is the first end-to-end external-client submission validation.

## 10. Automated Health Checks

The read-only VPS health check verifies that Nodes 1 and 2 share a chain ID and block height, are not syncing, and meet configurable minimum peer counts:

```bash
cd /opt/aichain
bash ./scripts/check-vps-devnet-health.sh
```

The laptop check verifies its localhost RPC, chain ID, synchronization state, and peer count:

```powershell
cd C:\AIChain
.\scripts\check-laptop-devnet.ps1
```

These checks do not replace load, fault, reorganization, or security testing. They are safe readiness checks before a benchmark, receipt-submission demonstration, or maintenance operation.

## 11. Change Log

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
| 1.0 | 2026-08-19 | Recorded successful data-driven submission of the second demonstration receipt |
| 1.1 | 2026-08-19 | Added optional prototype issuer-attestation workflow |
| 1.2 | 2026-08-19 | Recorded verified issuer attestation for the second demonstration receipt |
| 1.3 | 2026-08-19 | Recorded Phase 1B AuthorityRegistry deployment |
| 1.4 | 2026-08-19 | Added distinct demo agent wallet and repeatable controller-delegation workflow |
| 1.5 | 2026-08-19 | Recorded successful demo organisation registration and active agent delegation |
| 1.6 | 2026-08-19 | Added funding and agent-issued receipt workflow for the active demo delegation |
| 1.7 | 2026-08-19 | Recorded the completed agent-signed, agent-anchored, actively delegated demonstration |
| 1.8 | 2026-08-20 | Added reproducible same-VPS second-node synchronization and partition/rejoin workflow |
| 1.9 | 2026-08-20 | Recorded successful same-VPS initial sync and controlled partition/rejoin validation |
| 2.0 | 2026-08-21 | Added and recorded successful external laptop-to-VPS P2P synchronization workflow |
| 2.1 | 2026-08-22 | Added dedicated laptop development-account funding workflow |
| 2.2 | 2026-08-22 | Added and recorded first laptop-originated batch-submission workflow |
| 2.3 | 2026-08-22 | Added read-only VPS and laptop devnet health checks |
