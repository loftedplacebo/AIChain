# KawPoW private relay orchestration

Version: 0.1.0-draft · Updated: 2026-09-15 · Status: development-only

## Purpose

The relay renderer replaces improvised, hand-composed SSH tunnel commands in
disposable multi-region KawPoW trials. It does not expose JSON-RPC, open a
firewall port, contact a host, install a key, start a node, or approve a testnet.

## Model

Each miner makes an outbound authenticated SSH connection to a controlled
validator/relay host. The remote listener binds strictly to `127.0.0.1`:

```text
miner localhost:30303 → encrypted SSH reverse forward → relay localhost:31xxx
```

The validator may add each resulting loopback endpoint as a P2P peer. No RPC
listener is forwarded and no relay port is publicly bound.

## Render a plan

Keep the real inventory outside Git. It contains addresses, users and public
host/key material. Start from
[`../fixtures/phase4/relay-plan.example.json`](../fixtures/phase4/relay-plan.example.json):

```bash
python3 scripts/render-kawpow-relay-orchestration.py \
  /absolute/private/relay-plan.json \
  /absolute/private/relay-rendered
```

The command rejects duplicate miner/region/relay-port identifiers, unsafe
paths, invalid IPs and malformed public keys. It produces:

- `manifest.json` — public-safe role/region/port evidence only;
- `relay-authorized-keys.txt` — exact source-restricted relay key entries;
- `relay-known-hosts` — a pinned relay host key; and
- `start-miner-relays.sh` — exact loopback-only commands, to execute only on
  the named miners after the relay key entries are reviewed and installed.

The generated directory is private operational material: it contains endpoint
and identity-path details and must not be committed.

## Operational rules

- Verify every provider host fingerprint before putting it in the plan.
- Use a dedicated, per-miner relay public key. Give it no shell access; the
  generated relay entry uses `restrict`, permits forwarding and pins only its
  assigned loopback listener.
- Review the generated `relay-authorized-keys.txt` before the relay operator
  installs it. Keep an explicit change record and remove the tagged entries at
  teardown.
- Run tunnel commands under a supervisor and record their PIDs, start time,
  peer identity and exit status in restricted evidence.
- Do not use `StrictHostKeyChecking=accept-new`, wildcard listeners, public
  JSON-RPC or provider-wide firewall openings for this workflow.

This is an operational aid for disposable development networks. It neither
settles a production P2P architecture nor replaces the closed-testnet access,
monitoring, operator-separation and incident-response gates.
