# Exchange readiness strategy

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

19 September 2026 · Secondary strategic objective · Not a listing plan, token offer, liquidity promise or exchange application

**20 September scope update:** [the settlement architecture review](13-settlement-architecture-decision.md) recommends an established-network product launch without requiring an Orvessian token. Exchange readiness remains conditional and secondary; it is not a launch dependency or a reason to add an application token. Native-asset requirements below apply only if an own-chain asset is later justified.

## Decision

An eventual exchange listing can improve access, price discovery and operational procurement for a genuinely used network asset. It must remain secondary to secure mainnet operation, independent verification demand and compliant disclosure.

The project should build **listing readiness**, not chase a listing date. A native L1 asset requires an exchange to integrate node infrastructure, deposits, withdrawals, consensus monitoring and custody controls. This is materially more demanding than listing a standard token on an already-supported chain. A rushed listing before the network is stable increases both technical and market-integrity risk.

## What a credible listing candidate looks like

| Area | Evidence to build before an application |
|---|---|
| Real utility | Direct anchoring, managed-service sponsored gas, independent verification and repeat external use; no reliance on a future roadmap alone |
| Technical reliability | Stable node releases, reproducible builds, public documentation, explorer/indexing, supported wallet flow, deposit/withdrawal test environment and published reorg/confirmation policy |
| Consensus security | Measured independent miners/nodes, hash-rate and concentration monitoring, public-testnet and mainnet incident history, and no unresolved critical consensus issue |
| Token transparency | Final supply/issuance schedule, all genesis wallets, circulating-supply methodology, timelocks, vesting, treasury releases and contract addresses reconciled to public chain data |
| Organisation | Clear issuing/foundation and commercial entities, disclosed ultimate beneficial owners and team, IP position, treasury controls and accountable operators |
| Legal/compliance | Jurisdiction-specific analysis of issuance, distribution, promotions, custody, sanctions/AML and exchange-facing disclosures |
| Market integrity | No undisclosed treasury dealing, insider-trading policy, material-information controls, wallet disclosure, lock-ups, conflict register and a ban on wash trading or price-support activity |
| Natural liquidity | Distributed mining/usage-led holders and organic counterparties; no obligation to manufacture volume, pay for promotional trading or guarantee price support |

Coinbase describes its review as covering legal, compliance and technical security, followed by business signals such as demand, traction and liquidity. It also notes that native blockchains can require additional exchange engineering work. [Coinbase listing process](https://www.coinbase.com/listings)

## Readiness sequence

### 1. Build the evidence pack before discussing a listing

Create a maintained, versioned data room containing the genesis manifest, tokenomics model, audited/reviewed contract artefacts, node build instructions, chain API/explorer documentation, security reviews, confirmation/reorg guidance, distribution and vesting tables, treasury wallet attestations, entity/UBO record, risk disclosures and material-event policy.

The data room should make no claim that the token will appreciate. It should distinguish live utility from planned utility and include all relevant limitations.

### 2. Establish controlled market conduct

Before any freely tradable market, adopt written controls for founder, employee, foundation and contractor wallets:

- disclose treasury and material affiliated wallets;
- lock non-mining allocations under the published schedule;
- prohibit trading while holding material non-public information and around defined announcement windows;
- record approved treasury gas-inventory purchases under the operating policy;
- prohibit wash trading, undisclosed paid promotion, price-support instructions, market-making mandates without legal approval, and misleading statements about supply or demand; and
- publish material chain, treasury, security and supply changes promptly and consistently.

UK cryptoasset rules and FCA policy materials address admissions/disclosures and market-abuse controls, including market manipulation. Obtain specialist advice for every intended jurisdiction before public trading or promotion. [FCA cryptoasset regime](https://www.fca.org.uk/publications/policy-statements/cryptoasset-regime)

### 3. Demonstrate native-chain custodiability

For a native asset, prepare a clean exchange-integration package: deterministic node builds, supported RPC methods, block/transaction decoding, address/key and transaction-signing guidance, testnet faucet, chain snapshots, monitoring endpoints, confirmation/reorg recommendations, incident contact process and release/change policy. Keep critical upgrade powers narrow and documented; unexplained superuser powers, mutable balances or unstable consensus make custody harder.

### 4. Seek a venue review only when the basics are true

Apply only after the project can supply the evidence above and answer technical/compliance questions promptly. Do not pay for fictitious market activity, allocate tokens in exchange for a promised listing, or describe an application as a listing commitment. The selection, timing and jurisdictional availability remain the venue’s decision.

## What not to do to become “exchange ready”

- Do not make exchange listing or token price a roadmap KPI.
- Do not run a retail token sale merely to create holders or volume.
- Do not use foundation fiat to buy tokens for price support.
- Do not distribute tokens without lockups, wallet transparency and a documented purpose.
- Do not build a bridge or wrapped version merely to access a venue before the native chain and its security are mature.
- Do not promise market makers a price band, return, volume target or foundation backstop.

## Relationship to the 60% mining model

The 60% mining/security allocation can help create a more distributed holder base if emissions are slow, mining remains independently accessible and pools/large wallets are monitored. It is not enough on its own: concentrated early miners, rapidly released treasury tokens or undisclosed affiliated wallets would undermine the distribution story.

The 15% foundation treasury, 10% ecosystem, 10% team and 5% strategic reserve must remain in on-chain or independently verifiable lock/vesting arrangements. Exchange diligence will focus on how much is actually circulating, who controls the remaining supply and whether those parties can abruptly affect the market.

## Practical milestone

Treat exchange readiness as an evidence checklist that can begin during mainnet preparation. A venue outreach decision should require a recorded sign-off from protocol/security, finance/governance and legal/compliance owners that the technical, supply, market-conduct and disclosure packs are complete.

No public listing target date is proposed.

This strategy depends on the [day-one network and contract plan](09-day-one-network-and-contract-plan.md), [token demand and adaptive security budget](10-token-demand-and-adaptive-security-budget.md) and [tokenomics/mining-security work package](08-tokenomics-and-mining-security-work-package.md).
