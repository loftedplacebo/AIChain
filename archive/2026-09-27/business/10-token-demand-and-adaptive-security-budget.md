# Token demand and adaptive security budget

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

19 September 2026 · Economic design proposal for modelling and legal review · Not a price forecast, token promotion or final protocol specification

**20 September scope and model clarification:** [the settlement architecture analysis](13-settlement-architecture-decision.md) recommends a product launch without requiring an Orvessian native token. The own-chain economics below remain conditional modelling ideas. A 60% reserve alone does not establish an adequate security budget; indefinite tail issuance must be reconciled with any finite cap/lifetime allocation. Offsetting subsidy against fees can leave miner revenue unchanged and requires adversarial testing, rather than being treated as a validated adoption incentive.

## Recommendation

Do not try to make people hold the token through promises of price appreciation, passive yield or artificial buybacks. The sustainable reason to hold it is that it is needed to use and secure an independently useful verification network.

Supply restraint does not mean underpaying miners. The protocol needs enough predictable reward to buy independent hash power during quiet periods. The working 60% mining allocation is compatible with scarcity only if its emission is slow and predictable, the remaining 40% is transparently locked, and the security-budget model shows that the reward path does not leave the chain cheaply attackable.

The recommended model has three connected sources of demand:

1. **Network use.** Native tokens pay protocol gas for direct anchoring and for the company-sponsored transactions that support managed API customers.
2. **Security and operations.** Miners receive block rewards and transaction-priority fees. Later, only where a real public service needs economic accountability, independent relayers, indexers, proof providers or attestation providers may post refundable, slashable operating bonds.
3. **Fee sink.** A protocol base fee can be burned under a carefully reviewed EIP-1559-style mechanism, while a separate priority fee compensates miners for inclusion. Burning is a supply mechanic, not a promise that the token will appreciate.

The company should acquire the native asset only as needed to sponsor customer anchoring, maintain a bounded operational inventory and disclose that policy. It should not run undisclosed market-support purchases, promise buybacks, or use company revenue to create a speculative narrative.

## Managed-service gas inventory

Converting fiat service revenue into native tokens is legitimate when it funds a defined operational need: sponsored transaction gas for accepted customer submissions. It becomes artificial and potentially improper when its purpose is to create the appearance of demand, influence the price, support a trading market or reward holders without a corresponding network requirement.

Adopt a written treasury policy before any external purchase:

- set a published inventory band, for example a defined number of months of forecast sponsored-gas consumption, rather than an open-ended balance;
- forecast from accepted, paid logical receipts and measured batch/gas costs, never from a desired token price or marketing target;
- rebalance on a fixed schedule or at pre-disclosed inventory thresholds, with price/volume execution guards and an approval record;
- use named treasury wallets, segregated custody, multi-person approval and periodic reconciliation of purchased tokens, sponsored gas, remaining balance and realised service cost;
- prohibit leverage, undisclosed market making, purchases around material announcements, wash trading, token lending for yield and any representation that purchases will support the market; and
- disclose the operational policy and material changes before public distribution or trading activity.

The company should use genesis/treasury inventory for private development and testnet where feasible. Once an external market exists, purchases made under this policy are ordinary operating procurement. They are not fee revenue, token-holder return, customer adoption or evidence that the asset should rise in value.

## What creates legitimate holding demand

| Holder / user | Why they need the token | Design constraint |
|---|---|---|
| Direct developer or application | Pays gas to submit an anchor or interact with a public verification contract | Managed API remains fiat-priced so token ownership is optional for normal customers |
| Managed verification operator | Maintains a bounded gas inventory to batch customer submissions | Inventory policy, custody and accounting must be disclosed and risk-bounded |
| Miner | Holds working capital and earns deterministic subsidy plus priority fees | Mining is a security service, not a yield product for passive holders |
| Independent public service operator, later | Posts a refundable performance bond for a narrowly defined relayer/indexer/proof service | Add only after the service, fault evidence and dispute process exist; no generic staking on day one |
| Governance participant, later | Uses token only if a mature, bounded governance process is justified | Do not make token-weighted governance the day-one control plane |

The differentiator is not that every AI customer must buy a token. It is that a growing volume of independently valuable verification activity requires a scarce, neutral settlement and security resource. Batching reduces per-event cost without removing that demand: each batch still consumes block space and an anchorer still pays the network.

## Fee design

Adopt a simple public gas market first. Evaluate a congestion-responsive base fee only after the public-testnet workload demonstrates it is needed and the implementation receives review.

If adopted, the intended split is:

```text
transaction cost = protocol base fee + user-selected priority fee

protocol base fee  -> burned
priority fee       -> block producer
```

This mirrors the separation in EIP-1559: the base fee responds to capacity usage and is not paid to the transaction selector, while the priority fee rewards inclusion. It can make the native token necessary for block space and offset issuance when demand is real, but it cannot guarantee reduced supply or increased value. [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559)

For managed API customers, the company quotes a fiat service price. Its batching worker sponsors the transaction and accounts separately for protocol gas, queueing, retries, confirmation tracking, export and support. The company may pass through a transparent congestion surcharge in exceptional conditions, but it should not expose customers to an opaque token-price spread.

## Adaptive miner reward design

Miner rewards should respond to actual fee income, **not raw receipt count, API calls, model tokens, prompts, claimed AI work or company-reported adoption**. Those measures can be manufactured cheaply or manipulated through internal subsidies.

Use a two-part reward:

```text
miner income in an epoch = protocol subsidy + priority fees

protocol subsidy = clamp(minimum subsidy,
                          planned security-budget envelope - rolling miner fee income,
                          maximum subsidy for that epoch)
```

The constants are set in native-token units in the protocol schedule; the calculation needs no token-price oracle. The schedule has a published lifetime emission ceiling or explicitly disclosed tail rule. Rolling fee income uses completed blocks over a fixed historical epoch, not unconfirmed mempool traffic.

The effect is deliberate:

- When real usage and priority-fee income rise, miners earn more immediately and the subsidy can reduce within its pre-set envelope.
- When fees fall, a minimum predictable subsidy remains so security does not abruptly collapse.
- The maximum subsidy prevents a demand spike from creating unbounded new issuance.
- The calculation is publicly reproducible from chain data.

This is a **security-budget stabiliser**, not an algorithm that rewards adoption with ever-increasing inflation. It should be modelled against a simpler fixed declining subsidy and, if retained, reviewed as a consensus feature before public testnet. Fee-only security can be unstable when transaction demand is low, which is why a young PoW network should not assume it can remove subsidies immediately. [EIP-1559 rationale](https://eips.ethereum.org/EIPS/eip-1559)

## Optional later adoption reserve

Do not implement this at genesis. If, after public operation, the project needs an adoption accelerator, consider a **finite, separately labelled reserve** rather than modifying the mining subsidy. It must have all of these controls:

- fixed lifetime amount and fixed epoch maximum;
- activation only after independently measured, paid, unaffiliated protocol-fee spend and participant diversity thresholds;
- no credit for free API requests, company-subsidised traffic, internal wallets, duplicated receipts or raw model activity;
- a public methodology, fraud review and delayed finality window; and
- automatic expiry of unused allocation, with no discretionary reallocation.

Even then, the reserve is a distribution experiment, not a holding incentive. It should not launch until the project can detect related-party use, rebates and sybil participation well enough to make the measure meaningful.

## What not to build

- Passive token staking rewards for holders who provide no defined service.
- Reward boosts based on unverified AI workload, API submissions, model tokens or self-attested “useful work.”
- Guaranteed buybacks, price floors, APY claims, burn-based appreciation claims or liquidity promises.
- A bridge, lending market, exchange, stablecoin or broad token-voting system before they solve a demonstrated verification-network need.
- Slashing for a role without an objective service obligation, observable failure proof and appeal process.

## Decision gates

Before adopting any fee burn, adaptive subsidy or service bond, require:

1. Simulation against low, base and high demand; hash-rate shocks; concentrated miners; fee spikes; and low token liquidity.
2. Reproducible accounting of issuance, burned fees, miner revenue, circulating supply and locked/bonded balances.
3. An adversarial analysis showing how subsidised submissions, related parties, sybils and fee recycling could game the mechanism.
4. Public-testnet implementation and an independent review of any consensus or contract change.
5. Jurisdiction-specific legal, tax, accounting and financial-promotion review before public communications or distribution.

## Plain language policy

> The token pays for shared verification-network capacity and helps fund the miners and operators who secure it. We do not promise that holding it will produce a return. Network use may create demand for block space; protocol fees and rewards are published so participants can independently assess the economics. Any future bond, fee or reward mechanism will be specified, tested and governed before activation.

This proposal complements the [day-one network and contract plan](09-day-one-network-and-contract-plan.md) and the [tokenomics and mining-security work package](08-tokenomics-and-mining-security-work-package.md).
