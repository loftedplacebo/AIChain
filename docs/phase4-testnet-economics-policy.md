# Phase 4 testnet economics policy

Version: 0.1.0-draft · Updated: 2026-09-15 · Status: decisions open

This document separates what is needed to operate a closed testnet from final
mainnet monetary design. No value-bearing asset or bridge is authorized by it.

## Closed-testnet defaults

- Native currency is valueless disposable test currency.
- Faucet funding, if used, is rate-limited and restricted to identified test
  operators; there is no public faucet at this stage.
- Gas and mining rewards are enabled only far enough to exercise execution and
  block production. Exact reward, issuance and supply values remain TBD.
- AVR ingress and proof verification use explicit queue, batch-size, byte-size,
  and per-client limits. Rejected work is not silently retried forever.
- Confirmation labels are measured observations, not finality guarantees.
  Bridge-style applications must use a stricter confirmation policy than AVR.

## Decisions required before public testnet

1. Target block interval and acceptable p95/p99 confirmation windows.
2. Initial and steady-state mining reward, issuance cap, and supply invariant.
3. Base fee policy, minimum gas price, and whether priority fees are retained,
   burned, or paid to miners.
4. Receipt/proof byte pricing and anti-spam quotas under sustained load.
5. Reorg/stale handling for application confirmations.
6. Whether a test stablecoin is deployed as an ordinary EVM application only.

The stablecoin/bridge track remains separate. A production bridge requires
independent review of consensus finality, validator/miner distribution,
upgrade authority, monitoring, pause/recovery and audit controls.
