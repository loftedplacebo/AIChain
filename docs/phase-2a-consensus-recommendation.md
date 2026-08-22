# Phase 2A Consensus Recommendation

| Field | Value |
|---|---|
| Status | Research-backed recommendation — **not** an algorithm selection |
| Version | 0.1 |
| Last updated | 2026-08-22 |
| Decision affected | L1-001: GPU-friendly PoW and quantum-resilience assessment |

## Executive answer

AIChain should **not** use proof-of-AI or proof-of-useful-work as its base-chain consensus mechanism at launch. The recommended Phase 2A path is a **GPU-targeted Proof-of-Work evaluation**, with a ProgPoW/KawPoW-style family as a leading evaluation candidate, while retaining the right to reject it after benchmarks and security review.

Build verified AI computation as a separate market and reward layer above the neutral L1—not as the source of block-production authority.

## Why

### GPU-targeted PoW is the best current fit

- It preserves permissionless block production with a work function that can be independently and cheaply verified by every node.
- It is compatible with the project’s EVM/Core-Geth foundation and the intended GPU operator community.
- AI providers can contribute spare or deliberately allocated GPU capacity, but receive no special consensus role. Their share of work still determines only their normal share of block-production probability.

GPU targeting must be described honestly. It is an economic objective to reduce the advantage of specialised hardware; it is **not permanent ASIC immunity**. Ethash itself was memory-hard and intended to resist ASIC advantage ([ethereum.org](https://ethereum.org/developers/docs/consensus-mechanisms/pow/mining/mining-algorithms/ethash/)). The ProgPoW specification and its audit provide a concrete GPU-targeting design lineage to evaluate ([EIP-1057](https://eips.ethereum.org/EIPS/eip-1057); [Least Authority audit](https://leastauthority.com/static/publications/LeastAuthority-ProgPow-Algorithm-Final-Audit-Report.pdf)).

An ASIC-first approach is not recommended for AIChain’s initial network. Mature ASIC ecosystems can concentrate supply: Cambridge reports that the largest SHA-256 ASIC vendor held 82% of the observed market and the largest three more than 99% ([Cambridge Digital Mining Industry Report](https://www.jbs.cam.ac.uk/faculty-research/centres/alternative-finance/publications/cambridge-digital-mining-industry-report/)). That does not prove every ASIC algorithm will centralise, but it is a material long-term governance risk for a young network.

### Proof-of-AI should not secure the L1 yet

AI training/inference has value, but that is exactly why it is a poor default security budget: a miner can recover some or all of its costs from the useful output, weakening the economic cost of an attack. The literature continues to identify security-economic trade-offs in proof-of-useful-work ([SoK: Is PoUW Really Useful?](https://orbilu.uni.lu/handle/10993/67110); [Economics of PoUW](https://arxiv.org/abs/2606.06700)).

More importantly, “AI work” is not a single, universally cheap-to-verify computation. Current AI-compute systems add specialised deterministic execution, verification, arbitration, or validator/evaluator mechanisms. Gensyn describes deterministic ML execution plus cryptoeconomic arbitration as separate components ([Gensyn Network Docs](https://docs.gensyn.network/)). Bittensor explicitly separates its chain consensus from miner evaluation and incentives ([Bittensor Chain Consensus](https://www.bittensor.com/docs/concepts/chain-consensus)). Those patterns support AIChain’s existing design: use the L1 for neutral settlement/verification and put AI-work incentives in a separate protocol layer.

## Option comparison

| Option | Strength | Main failure mode | Recommendation |
|---|---|---|---|
| GPU-targeted PoW | Permissionless, understandable, reusable GPU ecosystem, cheap universal verification | GPU/cloud-provider concentration; eventual specialised hardware | **Evaluate first** |
| ASIC-oriented PoW | Clear hardware efficiency and strong dedicated-security incentives | Supply-chain and miner concentration; poor alignment with accessible GPU participation | Defer / reject for initial network unless evidence changes |
| Proof-of-AI/useful work as consensus | Compelling narrative; could reward computation with external value | Work verification, task-owner control, useful-work discount, proprietary data/models, variable latency | Do not use for launch consensus |
| AI-work market above PoW L1 | Lets AI providers earn for verifiable compute without controlling blocks | Requires separate market, verification, and dispute design | **Preferred future product track** |

## Long-term architecture

```text
GPU-targeted PoW → neutral L1 block production and settlement
                         │
                         ├─ AVR / OVL evidence anchoring
                         ├─ ZK policy-proof verification
                         └─ later AI-work market: jobs, verification, rewards, disputes
```

An AI provider may mine with GPUs and separately offer verified compute. The network must not assume that an AI provider’s hardware makes it a trusted verifier or allows it to “secure its own” private history; all blocks and proofs remain subject to the same public rules.

## Phase 2 split

Phase 2 is now operated sequentially:

1. **Phase 2A — Consensus:** resolve L1-001 only after candidate benchmarks, a quantum-threat assessment, attack analysis, and a Core-Geth integration spike.
2. **Phase 2B — ZK and AI-work evaluation:** define a narrow proof statement, compare stacks, then separately evaluate any AI-work market. It must not alter base consensus without a new architecture decision.

## Required gate before selection

For each PoW candidate, publish the same hardware/environment manifest and measure:

- GPU performance and node validation cost;
- effects on block propagation, orphan/reorganisation rate, confirmation distribution, and AVR batch throughput;
- ASIC/FPGA feasibility and vendor/supply concentration analysis;
- pool concentration and 51% attack cost model;
- difficulty, timestamp, DoS, and upgrade/fork behaviour;
- quantum assumptions, including the distinction between work-function exposure and wallet/signature migration; and
- a safe rollback or algorithm-transition plan.

Only then write the L1-001 ADR. Until then, Ethash remains a development-only engine and no quantum-resistance claim should be made for the operational chain.

