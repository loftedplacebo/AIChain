# Consensus and miner value review

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

20 September 2026 · Strategic decision review · No final mainnet consensus choice

**Superseded recommendation:** the subsequent [in-depth three-option analysis](13-settlement-architecture-decision.md) recommends an established public EVM network as the intended production architecture, with no planned own-L1 migration. It recommends removing new mining development from the product critical path rather than continuing the parallel miner programme proposed below. This earlier review is retained for rationale and history; no running network is changed by either document.

## Recommendation

Continue the GPU-oriented KawPoW work as a closed-testnet and community-development track. Do **not** yet make a public PoW mainnet an irreversible product commitment.

The product needs a durable, independently checkable record of selected AI actions. It does not automatically need its own consensus network on day one. A sovereign PoW chain becomes justified only when the project can show that independent settlement is materially more valuable than anchoring to an established network, and that its own security budget can sustain independent miners without relying indefinitely on founder subsidy or speculative demand.

The current AIChain record supports this staged posture: its closed-testnet foundation explicitly retains KawPoW as a development profile while leaving mainnet PoW, block interval, rewards, supply, fees and economics unresolved. [Closed-testnet foundation](C:/AIChain/docs/archive/2026-09-27/own-chain/phase-4-closed-testnet-foundation.md)

## The honest miner proposition

A miner is not paid for believing in AI verification. A miner contributes hash power when expected revenue covers, or is expected to cover, electricity, hardware, pool, operational and risk costs.

```text
miner gross revenue = block subsidy + priority/inclusion fees
miner net result    = gross revenue - electricity - hardware - pool - operations - risk
```

Miners can sell earned coins. For there to be a buyer, the network needs actual demand for block space and security: direct anchoring, a managed operator acquiring gas inventory, independent service providers posting required bonds only where justified, and a transparent supply/fee policy. Emission alone distributes tokens; it does not create durable buyer demand.

The company may subsidise early testnet or a tightly bounded launch period through the published issuance schedule. It should not secretly prop up mining economics, promise profitability, or buy tokens to support the market. Bitcoin’s basic incentive model likewise combines new issuance and transaction fees; as issuance falls, fees become a larger component of miner income. [Bitcoin developer guide](https://developer.bitcoin.org/devguide/block_chain.html)

## What PoW would give the project

| Potential value | Why it could fit Orvessian |
|---|---|
| Open participation | GPU miners can contribute without receiving a large stake allocation from the project first |
| Independent block production | A successful, geographically and operationally diverse mining set reduces reliance on company-operated validators |
| Observable economic cost of reorganisation | Competing work makes rewriting confirmed records more expensive as additional work accumulates |
| Community surface | A miner/operator community can provide node operations, testing, documentation, incident observation and a constituency beyond API customers |
| Fairer early distribution than a large pre-allocation | The 60% mining reserve can distribute gradually to operators who provide a measurable security service |

These benefits exist only when the miner base is truly independent. Three GPUs controlled by one organisation, one dominant pool, temporary rented hash power or one hardware supplier do not establish decentralisation.

## What PoW costs the project

| Cost or risk | Consequence for AIChain |
|---|---|
| Security bootstrap | A new chain has little hash power and can be inexpensive to reorganise or censor relative to established networks |
| Ongoing subsidy | Block rewards dilute supply; too little reward weakens security, while too much reward does not create product demand |
| Miner sell pressure | Miners normally convert a portion of rewards into fiat to pay operating costs, so recurring demand must exceed or absorb emitted supply over time |
| Operational burden | Node releases, miner packages, pools, difficulty tuning, monitoring, incident response, reorg handling and exchange custody all become core work |
| Hardware/pool concentration | KawPoW reduces specialised-hardware advantage but does not prevent a large GPU fleet, pool or future specialist hardware from dominating |
| Energy and narrative cost | The project must be able to explain why the independent-work security model is worth its energy and operational footprint |
| Opportunity cost | Consensus work can delay the SDK, durable service, independent verifier and customer integrations that create the actual need for a ledger |

## Alternatives

| Model | Security source | Miner community | Product implication | Current recommendation |
|---|---|---|---|---|
| New GPU PoW L1 | AIChain’s own miner hash power | Strong potential | Full sovereignty, highest bootstrap and operating burden | Continue as a conditional long-term option |
| New PoS L1 | Staked native asset | Validator rather than miner community | Requires initial stake distribution and adds stake/custody/governance complexity | Do not switch merely to avoid PoW costs |
| Anchor verification commitments to an established L1 | Existing external validator/miner set | No AIChain mining community | Fastest credible public settlement path; foreign fees and dependency | Keep as a serious launch alternative and SDK destination |
| Private/company ledger | Company controls operations | None | Useful for internal workflow, weak independent-verification story | Insufficient as the final public trust layer |

The SDK and receipt model should remain destination-aware rather than assume a forever-fixed chain. A receipt needs explicit chain/genesis/contract binding, so an initial established-network anchor and a later AIChain destination can be differentiated without rewriting its evidence semantics. Do not present two destinations as interchangeable confirmations; each export must state exactly what network was checked.

## Recommended staged strategy

### Stage 1 — Product and closed testnet

Build the SDK, managed submission service, batching, independent verification and evidence export. Complete KawPoW closed-testnet evidence with independent GPU operators and validators. Use the testnet to learn whether a mining community appears around a useful developer product.

### Stage 2 — Public settlement choice

Before public developer beta, compare two operational paths using the same receipt profile and verifier:

- an established-network anchoring destination, with its actual fees and confirmation policy; and
- an AIChain public-testnet destination, with measured miner diversity, block behaviour, reorgs and service recovery.

This is a product/security comparison, not a contest for a preferred narrative.

### Stage 3 — Mainnet decision

Approve a PoW mainnet only if all of the following are evidenced:

1. External customers or integrators need an independent public settlement layer and use it repeatedly.
2. The network has a defined security objective, a measured attack-cost model and a reward schedule that funds it under low-demand conditions.
3. Independent miners, pools, validators and regions demonstrate meaningful diversity; no single affiliated operator is the practical chain owner.
4. The 60% mining reserve, remaining locked allocations and any tail-subsidy choice pass the supply and concentration model.
5. The team can operate node releases, security response, public documentation and a confirmation/reorg policy without compromising the managed product.
6. Independent technical and economic reviews find no blocker.

If these conditions do not hold, keep the product live with established-network anchoring and retain AIChain PoW as a research/testnet programme. That is a commercially responsible outcome, not a failure.

## Mining community design

The invitation to miners should be practical:

- publish reproducible GPU miner and node releases, supported hardware evidence and an honest difficulty/reward policy;
- reward valid block production through the published schedule and priority fees only;
- make node/miner documentation, testnet challenges and bug reports useful community contribution paths, with small separately budgeted grants where appropriate;
- publish hash-rate, pool and concentration metrics, including the limits of those measures;
- maintain a clear incident and upgrade process; and
- never market mining as a passive income product or promise token returns.

Miners need liquid coins to manage operating costs, but a future exchange listing is not the miner incentive itself. The underlying incentive is a defensible combination of subsidy, fees and a real user base that values verification capacity. Exchange readiness follows from that operational reality.

## Next decision artifact

Create a consensus decision scorecard before public testnet with: product settlement requirements; estimated established-chain anchoring cost; AIChain miner-security budget; independently controlled hash-rate target; operator-diversity evidence; expected reorg/confirmation profile; staffing/operational cost; energy/communications rationale; and a recommendation to proceed, defer or anchor externally.

This review complements the [tokenomics and mining-security work package](08-tokenomics-and-mining-security-work-package.md), [day-one network and contract plan](09-day-one-network-and-contract-plan.md) and [exchange readiness strategy](11-exchange-readiness-strategy.md).
