# Tokenomics and AI-Native Currency Design

**Decision brief | 22 August 2026**

## Executive answer

Adopt a **capped, work-released utility token**, not an uncapped "more workload = more coins" rule. Mint a small, transparently locked treasury at genesis; release most remaining supply only when the network produces independently verified, paid-for useful work; retain a decaying security/validator budget; and burn a protocol base fee. The important distinction is that **work should unlock a bounded allocation, not set an unbounded issuance rate**.

For agent payments, do not force agents to budget in a volatile native asset. Use stablecoins for price quotes and x402-style pay-per-request settlement, while the native token secures validation, funds rewards, backs dispute bonds, and governs constrained protocol parameters. This gives agents predictable budgets and the token a necessary role.

## Recommended architecture: Proof-of-Useful-Settlement (PoUS)

Each completed job produces a signed work receipt: request commitment, quoted stablecoin price, execution/resource evidence, response hash, buyer acceptance or an expiry rule, independent quality score, and dispute outcome. A job is eligible for rewards only if (1) a non-affiliated buyer paid, (2) the receipt is unique, (3) the result passes a task-specific verifier, and (4) the worker and verifier have sufficient bond/reputation. Receipts are batched per epoch; do not put model inputs or private outputs on chain.

Reward useful economic settlement rather than raw GPU seconds, token transfers, prompts, or self-reported tasks. Raw activity is cheap to fabricate; paid, independently checked demand is harder to fabricate, though still not impossible. Use audits, random re-execution, slashing, buyer deposits for high-value tasks, anti-Sybil rate limits, and quality-weighted allocation.

## Illustrative supply policy (to be modelled before launch)

Set a maximum supply of 1,000,000,000 units. This figure is illustrative; the policy and auditability matter more than the round number.

* 5% genesis treasury: 1% operational runway released linearly over 24 months; 4% community/R&D treasury behind a timelock and published budget. No discretionary "emergency" mint key.
* 55% verified-work reserve: 70% released on a slow time curve and 30% released only when a public useful-work baseline is achieved. Unreleased units never become a discretionary treasury balance.
* 25% security and verification reserve: rewards validators, challengers, availability providers, and dispute resolution; start higher, decline predictably, then review before any permanent tail emission.
* 15% ecosystem reserve: grants, interoperability, and early liquidity, all subject to on-chain vesting and public recipient disclosure.

The Filecoin precedent is instructive, not a template: its capped supply and dual simple/baseline minting make some issuance contingent on provable network utility. The proposed design uses the same basic principle but makes paid, verified service receipts - not stored capacity - the baseline.

Suggested epoch rule: `work_release = min(epoch_cap, reserve_remaining, quality_adjusted_settlement_score × release_factor)`. The epoch cap is non-negotiable. `quality_adjusted_settlement_score` should be capped per buyer, per worker, per task family, and per epoch; it should decline for correlated identities and disputed work. Start conservatively with a mostly time-based release, because no useful-work metric is mature at launch.

## Fees and burn

Use a dynamic **base protocol fee** on settlement/verification bandwidth and burn it, EIP-1559 style. Pay verifiers and block producers with an explicit priority/service fee plus the security budget, not with the base fee. This separates predictable pricing from validator incentives and makes fee manipulation less attractive.

Do not promise that burning "controls inflation" or makes the token deflationary. It is demand-dependent and can be near zero in quiet periods. The credible inflation control is the hard maximum, epoch caps, public schedules, and no privileged minting. Burns are a secondary sink that returns usage value to all holders. Slashing is separate: route a portion to challengers and a portion to burn, so misconduct funds detection rather than becoming a pure spectacle.

## Why this is better than the alternatives

Hard-capped scheduled issuance is easiest to explain and audit, but it pays when the network is idle. Pure fee-only issuance is risky early: security and validation are underfunded before demand exists. Pure workload-proportional issuance gives the wrong objective: a network can create more coins by generating useless work. Uncapped inflation controlled by governance is flexible but weakens credible neutrality and makes agent cost planning harder. PoUS retains predictable scarcity while directing marginal rewards to delivered utility.

## AI-native design: make the token an economic credential, not merely an AI meme coin

Run two rails.

1. **Stable payment rail.** Agents receive quotes and set budgets in USDC or another regulated settlement asset. Use HTTP 402/x402-compatible payment requests for API, compute, data, and agent-to-agent purchases. Smart accounts enforce per-task limits, merchant allowlists, expiry, and session permissions.
2. **Native assurance rail.** Workers and verifiers stake the native token; valid receipts unlock work rewards; reputation, bonds, fraud proofs, and dispute outcomes determine future access and reward weight. Agents may earn the token through work, but they need not speculate on it to buy an API call.

The distinctive primitive is a portable, cryptographically signed **Work Receipt** with a task class, output commitment, payment attestation, verifier/quorum result, and reputation impact. Pair it with agent identity/reputation/validation registries such as ERC-8004, but retain privacy by publishing commitments and selective audit material rather than prompts or outputs. This creates an agent credit history and makes quality, not token velocity, the scarce asset.

## Launch sequence

Phase 0: start with fixed, low emission and a closed set of verifiable task types. Ship a public simulator showing worst-case supply, fee, burn, and treasury trajectories; publish a receipts spec, threat model, and independent audit plan.

Phase 1: turn on rewards for a small set of objective tasks (for example, deterministic compute, data availability, or benchmarkable inference). Cap any single buyer, worker, verifier group, and task type.

Phase 2: introduce subjective AI tasks only after a validator set, challenge market, and quality-evaluation harness have survived adversarial testing. Bittensor demonstrates that validator consensus can allocate AI-work rewards, but it also makes evaluation design the protocol's central security assumption.

Phase 3: decentralize parameters slowly. Supply cap, treasury unlocks, and burn logic should require long timelocks and supermajority thresholds; task-specific scoring models can evolve more quickly behind bounded budgets.

## Critical cautions

* Do not call self-generated requests "network usage." Require economically independent buyers and make wash-use expensive.
* Never let one foundation wallet alter the supply, work metric, or treasury without delay and disclosure.
* Native-token pricing is hostile to autonomous budgeting; stablecoin quotes are the default UX.
* Avoid marketing language about appreciation, deflation, or passive returns. Legal treatment turns on facts, distribution, and promotion; obtain jurisdiction-specific counsel before any distribution.
* Model issuance against demand, worker margins, validator costs, and attack cost. Token allocation is not a substitute for a viable unit economics model.

## Research basis and limits

The recommendation is a design inference from the cited sources, not financial or legal advice. Filecoin documents a capped, utility-linked minting model; Ethereum's EIP-1559 specifies a demand-responsive burned base fee; Bittensor documents emissions based on validator-scored AI work; x402 documents programmatic stablecoin payments over HTTP; ERC-8004 proposes portable agent identity, reputation, and validation. These sources establish mechanisms and trade-offs, not proof that this particular parameter set will succeed.

Sources: Filecoin, "Crypto-economics" (accessed 22 Aug 2026), https://docs.filecoin.io/basics/what-is-filecoin/crypto-economics ; Ethereum, EIP-1559 (2019), https://eips.ethereum.org/EIPS/eip-1559 ; Bittensor, "Emissions" (accessed 22 Aug 2026), https://www.bittensor.com/docs/concepts/emissions ; Coinbase Developer Documentation, "Welcome to x402" (accessed 22 Aug 2026), https://docs.cdp.coinbase.com/x402/welcome ; Ethereum, ERC-8004: Trustless Agents (draft, 2025), https://eips.ethereum.org/EIPS/eip-8004 ; ethereum.org, "AI agents" (accessed 22 Aug 2026), https://ethereum.org/ai-agents/ ; U.S. SEC, "Transactions Involving Crypto Assets" (Apr. 2026), https://www.sec.gov/resources-small-businesses/capital-raising-building-blocks/transactions-involving-crypto-assets .
