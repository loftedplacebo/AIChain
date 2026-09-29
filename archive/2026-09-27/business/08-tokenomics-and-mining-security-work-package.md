# Tokenomics and mining-security work package

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

19 September 2026 · Pre-public-testnet decision work · No issuance, reward, allocation, consensus or mining-policy parameter is approved by this document

**20 September scope update:** this work package is conditional on an own-chain release. [The settlement architecture review](13-settlement-architecture-decision.md) recommends an established public EVM network for product launch, removing mining work from that proposed critical path. The simulations specified below are planned work, not completed security evidence. Historical own-chain release requirements are preserved.

## Decision and timing

Start this work now, alongside Phase 4 acceptance and the P1 managed-verification slice. Complete the modelling and publish the public-testnet mining policy **before public testnet opens**. Make final mainnet economics and proof-of-work decisions only after public-testnet evidence, independent review and release readiness are available.

The working position is **GPU-oriented KawPoW through public testnet and the initial mainnet period**. A possible ASIC-oriented transition is a later governance question, expected no sooner than two to three years after mainnet launch. It is not a promise, scheduled fork or current product dependency.

## Current consensus position

The source review records a project-specific Core-Geth integration of **KawPoW seal verification** and an opt-in development **ASERT** difficulty profile. The current development profile allows 5-, 10- and 15-second block targets with a 1,800-second ASERT half-life; 10 seconds is the selected test profile. These are development settings, not frozen mainnet consensus or economics.

This is an integration of an existing GPU-oriented algorithm, not a newly designed custom PoW function. Project-specific code, activation conditions, chain ID, genesis and difficulty settings still mean a miner must follow this network's exact consensus rules.

Consequently, an existing SHA-256, Scrypt, Ethash or other unrelated ASIC cannot simply point its hash rate at the network. It will not produce valid KawPoW seals. That is not a complete defence against mining concentration: a manufacturer could eventually build purpose-made KawPoW hardware, a large GPU fleet could concentrate hash power, and pooled/rented GPU capacity can still change the security picture. KawPoW is therefore **ASIC-resistant, not ASIC-proof**. Its intended design is to limit the efficiency advantage of special-purpose hardware over commodity GPUs, not make custom hardware impossible. [ProgPoW rationale and specification](https://eips.ethereum.org/EIPS/eip-1057)

ASERT is a difficulty-adjustment algorithm, not an ASIC filter. It changes the target as observed block timing and hash rate move, with the aim of returning towards the chosen block interval. It cannot decide which hardware may mine and it cannot manufacture economic security where insufficient independent hash power exists. [ASERT specification](https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/2020-11-15-asert.md)

### Hardware-identification boundary

Proof-of-work consensus validates a proof, not the physical device that generated it. The protocol cannot reliably identify a GPU and reject an ASIC merely from a valid KawPoW result. KawPoW protects the GPU-oriented policy by making unrelated ASICs incompatible and reducing the expected advantage of specialised KawPoW hardware; it cannot reject a future purpose-built KawPoW ASIC that follows the rules. Monitoring hash-rate concentration, pool behaviour, hardware performance claims and abrupt efficiency changes is therefore part of the security programme.

## Explicit non-decisions

- Do not claim that existing ASICs are technically incapable of any future KawPoW implementation; no PoW function can provide that absolute guarantee.
- Do not introduce a custom PoW algorithm merely to claim uniqueness or ASIC resistance.
- Do not change PoW, ASERT, block time, emission, reward, supply or genesis allocations in the API/SDK product increment.
- Do not promise an ASIC migration date, economics, compatibility or reward treatment.
- Do not use manually increased difficulty as a scarcity or price mechanism. Difficulty exists to control expected block timing relative to available hash rate.

## Scenario model

Model each scenario with the same workload and independent sensitivity assumptions. The output is a decision record, not a price forecast.

| Scenario | Consensus posture | Potential benefit | Principal risks | Decision use |
|---|---|---|---|---|
| GPU-oriented baseline | KawPoW and ASERT; no planned ASIC change in the initial period | Accessible mining and continuity with current engineering work | Low early hash rate, GPU-rental concentration, eventual specialised KawPoW hardware | Baseline for public testnet and initial mainnet review |
| Eventual ASIC transition | GPU-oriented launch; later hard-fork option only after evidence and governance | Purpose-built security hardware may deepen long-term dedicated capacity | Hardware-manufacturer concentration, security shock at transition, stranded GPU miners and fractured community | Compare only after measured mainnet operation |
| Multi-algorithm PoW | Multiple valid work functions and changing work shares | Theoretical hardware diversity | Major consensus, wallet/node/miner complexity; new attack surface; hard-to-explain economics | Rejected for the first mainnet unless evidence overturns the simplicity/security case |

For every scenario, calculate at minimum:

```text
security budget = issued mining rewards + transaction fees available to miners
attack exposure = attainable hostile hash rate / independently controlled honest hash rate
miner revenue = expected block share × rewards and fees - electricity - hardware - pool costs
network service cost = sponsored anchoring fees + replacement/reorg costs + operating costs
```

Run values across low, expected and high token-price, fee-revenue, electricity-cost, hardware-availability and miner-concentration cases. Treat model outputs as sensitivity ranges; do not turn them into price, yield or profitability claims.

## Hash-rate shock simulations

Use the actual implementation and the proposed public-testnet configuration. Preserve every input, binary/source revision, seed, result and reviewer conclusion. The current development 10-second target and 1,800-second half-life are a starting test case only.

| Experiment | Input shock | Observe | Pass condition to define before running |
|---|---|---|---|
| Sudden inflow | 2×, 5× and 10× baseline hash rate | Block-time overshoot, ASERT convergence, orphan/reorg behaviour and pool concentration | Defined convergence envelope with no consensus disagreement |
| Sudden withdrawal | 50%, 80% and 90% loss of hash rate | Slow blocks, service confirmation delay, mempool growth and recovery time | Defined maximum degraded confirmation/availability window |
| Intermittent mining | Repeating on/off hash-rate cycles | Oscillation, profitability switching incentives and confirmation reliability | No unexplained instability; documented operator response |
| Dominant operator | 34%, 51% and higher simulated control under an approved isolated attack plan | Reorganisation cost, detection, alerting and verifier/status behaviour | Measured limits and an incident process, not a claim that attacks are impossible |
| Timestamp and boundary cases | Valid but adverse timestamps and target-boundary inputs | Cross-implementation agreement and target calculation safety | Reproducible results across independent validators |
| Service-load overlap | Miner shocks plus receipt-batch traffic | Inclusion tail, reorg reconciliation, duplicate prevention and customer status correctness | Bounded service behaviour with truthful degraded status |

Measure p50/p95/p99 block interval, time to the contracted confirmation policy, reorg depth/frequency, orphan rate, mempool age, ASERT target trajectory, independent miner share, pool share, node agreement and receipt-status correction rate. Do not declare a chain secure from a single benchmark or a three-host deployment.

## Public-testnet gates

Before publishing mining software or inviting external miners, record a release decision against all of these gates:

1. **Specification and reproducibility.** Canonical KawPoW, ASERT, genesis, chain identity, block target and activation rules are versioned; at least one independent validator reproduces the expected vectors.
2. **Hardware and operator diversity.** Test NVIDIA and AMD where supported, independent owners and networks, and more than one validator implementation or independently operated validation path.
3. **Shock evidence.** Complete the approved hash-rate-shock, fault, recovery and service-overlap simulations with published limits and unresolved risks.
4. **Operational response.** Monitor hash-rate concentration, block interval, reorgs, confirmation tail and node health; rehearse incident communications and pause criteria.
5. **Mining communication.** Publish supported software, pool/disclosure guidance, no-profitability disclaimer, known limits, support route and a statement that public-testnet rewards have no promised value.
6. **No hidden economic commitment.** Testnet rewards, faucets and credits must not silently establish final supply, reward, allocation or listing expectations.

## Mainnet decision gates

Mainnet is a separate approval. Its decision record must include:

- public-testnet duration and reproducible evidence from varied independent operators;
- the measured distribution of hash power, pools, hardware types and node operators, with concentration caveats;
- a security-budget model for low-activity and adverse-price/fee cases;
- final supply, issuance, reward schedule, fee handling, treasury/allocation and vesting proposals, each with governance and professional review;
- key custody, release-signing, incident and emergency-change procedures;
- an external review of consensus implementation and any material application contracts;
- a clear confirmation policy for the verification service under normal and degraded network conditions; and
- explicit approval from the protocol, operations, finance/governance and commercial owners.

## ASIC horizon and review trigger

Do not schedule an ASIC transition today. Publish the following review policy instead:

> The network launches GPU-oriented. The project will not consider an ASIC-oriented PoW change before at least two years of mainnet operation unless a material security incident or independently evidenced concentration risk requires an earlier governance review. Any proposed change requires a public technical specification, attack and migration analysis, testnet activation, independent review, node/miner upgrade path and documented governance approval.

At the review, compare the existing GPU posture with an ASIC-oriented alternative on: independently controlled security budget; manufacturer and pool concentration; accessible hardware supply; energy efficiency; attack cost; geographic/operator diversity; migration cost; client compatibility; and effect on application confirmation policy. The default outcome is no change unless the evidence makes a change safer and more sustainable.

## Plain public mining policy draft

> **AIChain mining policy — draft for public-testnet review**
>
> AIChain is testing a GPU-oriented KawPoW proof-of-work network with an ASERT difficulty-adjustment profile. Mining secures block production and transaction ordering; it does not verify the truth of AI outputs or run customer AI models. Public-testnet participation is experimental. Rewards, token value, profitability, mainnet supply and hardware returns are not promised.
>
> Only miners producing valid blocks under the published chain configuration can participate. Unrelated ASIC hash rate cannot be redirected to the network because it does not satisfy KawPoW consensus. KawPoW is designed to reduce specialised-hardware advantage, not guarantee that purpose-built hardware will never exist.
>
> We will publish tested client versions, configuration, supported hardware evidence, known limitations, network status and incident updates. We will measure miner and operator diversity, confirmation performance and reorganisation behaviour before making any mainnet decision. The initial network policy is GPU-oriented; any future ASIC-oriented change would be a separately specified, tested and governed consensus upgrade.

## Owners, outputs and cadence

| Owner | Immediate output | Evidence cadence |
|---|---|---|
| Protocol lead | Frozen candidate testnet parameters and reproducible simulation harness | Every engineering change and completed experiment |
| Security/SRE lead | Threat model, shock-test plan, monitoring and incident criteria | Weekly during testnet preparation |
| Finance/governance lead | Supply/reward/fee and security-budget sensitivity model | Monthly until mainnet decision |
| Product/platform lead | Confirmation policies and API/service behaviour during degradation | Per release candidate |
| Founder/communications lead | Public-testnet mining policy and claims review | Before any external mining invitation |

Record decisions in the decision register. No calendar date, mining benchmark or code merge alone closes a public-testnet or mainnet gate.
