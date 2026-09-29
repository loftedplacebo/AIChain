# Day one network and contract plan

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

19 September 2026 · Recommended launch design for decision and modelling · Not a genesis file, token offer, legal opinion or deployment authorisation

**20 September superseding recommendation:** [the settlement architecture analysis](13-settlement-architecture-decision.md) recommends deploying the verification application on one established public EVM network. The own-PoW launch recommendation below is retained as a conditional alternative, not the current recommended launch path. Minimal anchor contracts, signature/relayer separation and independent export remain relevant; genesis and native issuance do not apply to the proposed external-network launch.

## Recommendation

Launch the first network as a **simple proof-of-work verification chain**, not an AI-work-reward economy. The native asset secures block production and pays protocol gas. The managed verification product charges customers in fiat under a normal commercial agreement and sponsors its own network transactions. Customers should not need to buy or hold the native asset to submit a receipt through the managed API.

This gives the network a clear job on day one: order and confirm opaque verification commitments. It avoids coupling the security budget to subjective AI quality, self-reported workload, model-output scoring, a bridge, a stablecoin, a consumer wallet or a speculative data marketplace.

## What must be fixed before genesis

These decisions are network-defining. They must be specified, simulated, reviewed and released as one signed configuration package before a public or mainnet launch.

| Decision | Recommended day-one posture | Why it must be fixed |
|---|---|---|
| Chain identity | Unique chain ID, network name, genesis hash and bootnode policy | Prevents replay/confusion with any Ethereum-derived environment |
| Proof of work | GPU-oriented KawPoW | Defines valid blocks; unrelated ASIC hash rate cannot satisfy it |
| Difficulty adjustment | ASERT with reviewed target interval and half-life | Determines recovery under hash-rate shocks and expected confirmation behaviour |
| Block target and confirmation policy | Choose from public-testnet measurements; publish normal and degraded confirmation guidance | A fast target alone does not create reliable audit evidence |
| Native-asset supply | A deterministic, publicly calculable issuance schedule; choose either a hard cap or a clearly disclosed tail subsidy after security-budget modelling | Miner incentives cannot depend on discretionary minting |
| Miner reward and fees | Block subsidy plus transaction-priority fees; no hidden service share | Keeps the protocol security budget separate from company revenue |
| Genesis allocations | Small, transparent, on-chain allocations subject to timelock and vesting | Limits privileged supply and makes dilution auditable |
| Upgrade governance | Timelock, defined signers/process, public release artefacts and an emergency scope | A PoW or issuance change must not be a quiet operator action |

## Recommended allocation posture for modelling

Do not set miner rewards deliberately below the security budget in pursuit of scarcity. Low miner compensation can reduce independent hash power and lower the cost of attack. Scarcity should come from a credible maximum supply or disclosed tail rule, slow emission, locked non-mining allocations and real use of block space.

Use the following **60% mining** allocation as the working hypothesis to model and challenge:

| Pool | Working share | Release rule |
|---|---:|---|
| Mining/security emission | 60% | Deterministic emission through valid block rewards; no discretionary release |
| Protocol/foundation treasury | 15% | Timelocked, published wallets and budgeted spending; no mint authority; only a small pre-disclosed operating release available at launch |
| Ecosystem grants and independent operators | 10% | Separate labelled pool, milestone grants, public recipients and release records |
| Team and early contributors | 10% | Twelve-month cliff followed by at least thirty-six months of linear vesting in on-chain or independently verifiable contracts |
| Strategic/private financing reserve | 5% | Prefer equity financing first; any token allocation requires separate legal, governance and disclosure approval |

The non-mining 40% must be allocated at genesis to transparent lock and vesting contracts, but it should not be treated as freely circulating supply. Treasury and grant releases need published recipient, purpose, amount and date; team tokens must not be accelerated; and no pool can be replenished by an unlimited issuance key. Every point allocated at genesis reduces future miner distribution or another explicitly named pool.

## Issuance and fees

The first model should compare two honest choices:

1. **Finite declining subsidy.** A known maximum supply and reducing block rewards. It is simple to explain, but the network must demonstrate how miner security remains funded when issuance falls and fees are still small.
2. **Declining subsidy with a small permanent tail reward.** Predictable continuing dilution to provide a minimum security budget if usage fees stay low. It avoids pretending fees will immediately secure a young verification network, but must be disclosed plainly.

Do not choose a hard cap because it sounds attractive. Choose the schedule that leaves a credible, measured security budget in low-demand conditions. The public model must show supply over time, miner reward, fee assumptions, treasury unlocks, circulating supply and concentration sensitivity under each option. It must also test whether the 60% miner reserve can support the required early subsidy and any proposed tail rule without relying on fee or price assumptions.

Protocol gas pays for block space. The managed service price is different: it includes submission, queueing, batching, retries, confirmation tracking, export and support. The company can sponsor gas from a controlled operational balance and charge customers in fiat; it should not rely on native-token appreciation to fund the business.

## Smart contracts on day one

Keep contracts deliberately narrow and deploy only versions with an independent review, reproducible build artefacts and a public address registry.

| Contract/component | Day-one role | Required safeguards |
|---|---|---|
| Receipt batch anchor | Accept a receipt-batch root and necessary commitment metadata; support inclusion proof verification | Bounded inputs, event schema, replay/collision analysis, versioned deployment registry and independent review |
| Individual receipt anchor | Support the specific cases that genuinely need individual commitment anchoring | Clear issuer/relayer semantics; do not make an API key a cryptographic identity |
| Profile/verification registry | Register approved profile definitions and version digests where needed | Explicit ownership, timelock for changes, immutable historical references |
| Authority registry | Only if the selected first workflow needs on-chain authority history | Separate authority proof from general receipt claims; no blanket identity assertion |
| Governance/timelock treasury | Hold the disclosed treasury allocations and constrain changes/spend | Multisignature, timelock, published signers/process, narrow emergency permissions |

The initial chain should **not** launch with a bridge, wrapped assets, exchange contract, lending/staking product, AI-work reward contract, generic slashing system, stablecoin, arbitrary governance token voting, automatic buyback/burn or unbounded reward distributor. Each adds attack surface and regulatory/product complexity before it helps the verification use case.

## Deployment sequence

1. Publish versioned genesis candidate, chain ID, KawPoW/ASERT parameters, issuance alternatives and threat model.
2. Reproduce the candidate on closed testnet; run hardware-diversity, hash-rate-shock, reorg and service-overlap tests.
3. Deploy anchor/registry contracts to the isolated testnet from reproducible artefacts; publish bytecode hashes, addresses and verification instructions.
4. Run independent verifier, API-batching and evidence-export exercises against those contracts. Test contract upgrades and historical verification before permitting any upgrade path.
5. Open public testnet with an explicitly non-economic faucet/reward policy. Observe miners, node operators, confirmation tails, concentration and abuse behaviour.
6. Re-run the supply/security-budget model using public-testnet evidence. Record the mainnet decision: parameters, allocation totals, vesting, treasury signers, tail/no-tail choice, contracts and upgrade process.
7. Publish the final genesis manifest and contract registry before mainnet. Every allocation and contract address must reconcile to the published supply table.

## Day-one controls and disclosures

- Genesis wallets, treasury wallets, vesting schedules, signer policy and all contract addresses are public before launch.
- Treasury releases require the published timelock/multisignature process. An emergency role may pause a named contract function only where technically justified; it cannot mint tokens, change PoW or rewrite allocations.
- Contract source, compiler version, bytecode hash, audit/review status and known limitations are published.
- The chain publishes block and transaction data needed for independent verification, while receipt evidence stays customer-controlled unless disclosed.
- Public material states that proof-of-work confirmation is probabilistic, block time is not evidence of original AI execution time, and mining does not assess model correctness or safety.
- No price, yield, profitability, listing, appreciation or future-ASIC promise is made.

## Decisions to make in the next review

1. Select the economic security objective: target attack cost, desired independent-miner diversity and tolerated confirmation delay.
2. Choose and stress-test the block interval and ASERT half-life from the candidate configurations.
3. Compare hard-cap and tail-subsidy models under low activity, low fee and hostile hash-rate conditions.
4. Propose final allocation percentages, vesting and treasury controls against the modelling ranges above.
5. Decide whether initial protocol fees use a simple gas market only or an additional bounded congestion/base-fee mechanism; do not add fee burning without a clear security/economic purpose.
6. Freeze the minimal contract set for public-testnet audit; defer every other financial primitive.

The [tokenomics and mining-security work package](08-tokenomics-and-mining-security-work-package.md) supplies the experiments and release gates that must inform those choices.
