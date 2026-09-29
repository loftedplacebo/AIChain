# Phase 2A Consensus Research — Source Report

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

Audience: AIChain project decision-makers. Date: 2026-08-22. Scope: whether the independent AIChain L1 should use GPU-targeted PoW, accept ASIC-oriented PoW, or use proof-of-AI/useful work for base consensus.

## Direct answer

Do not make proof-of-AI/useful-work the base-chain consensus mechanism in the initial protocol. Proceed with a GPU-targeted PoW evaluation, with a ProgPoW/KawPoW-style design family as a leading candidate rather than a selection. Build verified AI computation as a separate market/reward layer above the neutral L1.

## Claim-to-source ledger

| Claim | Source | Notes |
|---|---|---|
| SHA-256 ASIC hardware supply is highly concentrated | [Cambridge Digital Mining Industry Report](https://www.jbs.cam.ac.uk/faculty-research/centres/alternative-finance/publications/cambridge-digital-mining-industry-report/) | Report says largest vendor 82%, largest three >99%; direct evidence for a mature ASIC ecosystem, not a prediction for any new algorithm. |
| Ethash was memory-hard and intended to resist ASIC advantage, not guarantee permanent resistance | [ethereum.org Ethash](https://ethereum.org/developers/docs/consensus-mechanisms/pow/mining/mining-algorithms/ethash/) | Official historical documentation uses “thought to make” resistance wording. |
| ProgPoW’s stated objective was GPU targeting / reduced specialised-hardware advantage | [EIP-1057](https://eips.ethereum.org/EIPS/eip-1057), [Least Authority audit](https://leastauthority.com/static/publications/LeastAuthority-ProgPow-Algorithm-Final-Audit-Report.pdf) | Candidate-family evidence; no adoption conclusion. |
| Modern AI-work networks split task verification/incentives from L1 consensus | [Gensyn protocol docs](https://docs.gensyn.ai/the-gensyn-protocol), [Bittensor chain-consensus docs](https://www.bittensor.com/docs/concepts/chain-consensus) | Bittensor explicitly distinguishes chain consensus from Yuma miner evaluation. |
| PoUW has unresolved security-economic trade-offs | [SoK: Is PoUW Really Useful?](https://orbilu.uni.lu/handle/10993/67110), [Economics of PoUW](https://arxiv.org/abs/2606.06700) | Academic/working-paper evidence; recommendation conservatively treats risks as unresolved. |
| KawPoW has public CUDA and OpenCL mining support and is a ProgPoW-based PoW implementation | [RavenCommunity kawpowminer](https://github.com/RavenCommunity/kawpowminer) | Direct implementation evidence. It establishes multi-vendor tooling availability, not security, decentralisation, or suitability for Core-Geth. |
| Autolykos v2 is presented by Ergo as a memory-hard GPU-oriented PoW and its v2 history enabled conventional pools | [Ergo Autolykos documentation](https://docs.ergoplatform.com/mining/autolykos/), [Ergo implementation history](https://github.com/ergoplatform/ergo/wiki/Mining-Ergo-before-The-Hardening-Upgrade) | Candidate-comparator evidence; performance and integration must be measured locally. |
| RandomX is deliberately optimised for general-purpose CPUs | [RandomX reference project](https://github.com/tevador/RandomX) | Direct project claim. This supports exclusion from a GPU-targeted shortlist, not a judgement on RandomX generally. |
| PQC signature standards include ML-DSA and SLH-DSA | [NIST PQC project](https://csrc.nist.gov/Projects/Post-Quantum-Cryptography) | Supports a future crypto-agility/migration posture only; it does not create EVM account compatibility or select a migration scheme. |

## Limits

No candidate algorithm benchmark or adversarial implementation test has yet been run. This report supports a phase gate and shortlist, not L1-001 selection. The candidate-specific document deliberately treats the work-function quantum question separately from the account-signature migration question.
