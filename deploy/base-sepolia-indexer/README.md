# Base Sepolia AVR indexer VPS bundle

This bundle runs the read-only Base Sepolia event indexer separately from the
synthetic receipt ingress service. It does not accept public connections, hold
signing keys, submit transactions, or change the existing ingress unit.

## Bundle contents

- `scripts/base-sepolia-avr-indexer.cjs`: explicit Base Sepolia worker and RPC
  failover.
- `sdk/typescript/avr-event-indexer.js`: durable range index and reorg rebuild.
- `package.json`: the only runtime dependency, pinned `ethers` 6.16.0.
- `aichain-base-sepolia-avr-indexer.service`: hardened systemd unit, installed
  separately at `/etc/systemd/system/`.

The service runs as its own unprivileged `aichain-indexer` account. Its only
writable path is `/var/lib/aichain-base-sepolia-indexer`; no API port is opened.
It uses Base Sepolia public RPC endpoints by default. For sustained
operation, configure an independently provisioned HTTPS RPC endpoint in a
systemd drop-in; never place credentials in the unit or repository.

## Install and operate

See `docs/vps-base-sepolia-avr-indexer.md` for the deployment procedure,
verification commands, rollback, and current testnet limitations.
