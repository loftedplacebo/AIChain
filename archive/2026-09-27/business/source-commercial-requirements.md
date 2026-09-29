# AI Verification Network

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.
## Commercial Product Strategy and Development Roadmap Requirements

### 1. Purpose of this document

The project has so far primarily focused on building the underlying blockchain protocol and proving that the core Layer 1 network can function.

The current architecture is based around an open, EVM-compatible blockchain with Proof of Work, GPU mining, independent nodes, AI Verification Receipts and cryptographic/ZK verification capabilities.

Development has progressed through a number of phases and is currently approaching the end of Phase 4.

This document introduces an important expansion of the project strategy.

The blockchain itself is not intended to be the primary commercial product.

The broader opportunity is to build an **independent verification infrastructure for artificial intelligence**, with the blockchain acting as the decentralised trust and evidence layer underneath a commercially operated AI verification platform.

The project should therefore evolve from:

**“Build a blockchain capable of recording AI verification.”**

to:

**“Build an open decentralised AI verification network, together with SDKs, APIs, integrations and enterprise services that make independent AI verification easy to adopt.”**

This distinction should influence the remaining technical roadmap.

The objective is no longer simply to complete the blockchain. The objective is to produce an externally usable product that AI developers and AI companies can integrate into real systems.

---

# 2. Core proposition

The long-term proposition is:

> **An independent verification network for AI.**

AI applications, agents and models continue to execute wherever their developers choose: OpenAI, Anthropic, Azure, AWS, local models, proprietary infrastructure, agent frameworks or other environments.

The network does **not** need to perform AI inference itself.

Instead, it provides an independent mechanism for recording and proving important facts relating to AI activity.

Conceptually:

**AI executes off-chain**

↓

**Verification evidence is generated**

↓

**A cryptographic commitment / verification receipt is created**

↓

**The receipt is submitted to the decentralised network**

↓

**Independent miners/nodes establish the permanent record**

↓

**The action can subsequently be independently verified**

The network therefore becomes an immutable verification and audit layer underneath AI systems.

The central proposition is not:

> “Run your AI on our blockchain.”

It is:

> **“Run your AI anywhere. Prove what happened independently.”**

---

# 3. Why a blockchain is used

The commercial proposition should not depend upon convincing customers that blockchain technology itself is desirable.

Customers primarily care about outcomes such as:

- independent verification;
- tamper-evident evidence;
- auditability;
- provenance;
- accountability;
- AI governance;
- traceability;
- reproducibility where possible;
- compliance evidence;
- independent timestamps;
- evidence that records have not subsequently been changed.

The blockchain is the mechanism that makes those properties possible without requiring customers to trust a database controlled solely by the commercial operator.

This distinction is important.

A conventional SaaS database can record that an AI system performed an action.

A decentralised verification network can provide independent cryptographic evidence that a particular commitment existed at a particular point and has not subsequently been altered.

The decentralised network is therefore the **trust layer**.

The commercial company builds products and services that make that trust layer useful.

---

# 4. Public protocol versus commercial product

The architecture should deliberately separate two layers.

## 4.1 Open verification network

The underlying blockchain should remain an open protocol.

Depending upon final protocol design, publicly available information may include:

- blocks;
- transactions;
- transaction hashes;
- verification receipt identifiers;
- timestamps;
- commitments;
- proof status;
- relevant public addresses;
- network state;
- miner information;
- protocol metadata.

A blockchain explorer should allow anyone to inspect the public network.

Technically capable developers should ultimately be capable of interacting directly with the protocol without being forced to purchase the commercial company's SaaS product.

This is important for decentralisation and credibility.

The blockchain must not merely become a private SaaS database presented as a decentralised network.

## 4.2 Commercial AI verification platform

Above the open network sits a commercially operated product.

Working name:

**AI Verification Cloud**

The commercial platform makes the protocol dramatically easier for organisations to use.

Instead of an AI developer needing to understand:

- blockchain transactions;
- wallets;
- RPC endpoints;
- gas;
- token management;
- receipt formats;
- cryptographic commitments;
- proof construction;
- retry handling;
- node availability;
- indexing;
- blockchain querying;
- evidence retrieval,

the developer should interact with a conventional software interface.

The ideal developer experience should eventually be approximately:

```python
from verifier import Verifier

verifier = Verifier(api_key="...")

result = agent.run(task)

receipt = verifier.verify(
    agent_id="claims-agent",
    action="claim_decision",
    evidence=result
)
```

The exact API should be determined during development.

The important principle is that blockchain complexity should be largely invisible to normal AI developers.

---

# 5. The AI Verification SDK

A major new development workstream should therefore be an official SDK.

This is potentially one of the most important distribution mechanisms for the entire project.

The initial SDK should probably be Python-first because of the prevalence of Python within AI development.

Additional SDKs can subsequently be considered, particularly TypeScript/JavaScript.

The SDK should handle as much of the verification lifecycle as possible.

Potential responsibilities include:

- authentication;
- receipt creation;
- evidence hashing;
- canonicalisation of evidence;
- cryptographic signing;
- proof generation where required;
- submission to the verification API;
- optional direct blockchain submission;
- transaction monitoring;
- confirmation handling;
- retries;
- retrieval of historical receipts;
- verification of existing receipts;
- structured error handling.

The intended developer experience should be extremely simple.

A developer should not need to become a blockchain engineer in order to add independent verification to an AI application.

---

# 6. Integration strategy

The project should not expect AI developers to adopt an entirely new development ecosystem.

Instead, the verification capability should be inserted into ecosystems developers already use.

Priority integration targets should be evaluated, including:

- OpenAI Agents SDK;
- MCP-based agent architectures;
- LangChain;
- LangGraph;
- CrewAI;
- other major agent frameworks;
- custom Python AI applications.

The first flagship integration should be evaluated around the **OpenAI Agents SDK**.

The objective should be to demonstrate that an existing AI agent can add independent verification with minimal additional code.

For example:

**Existing agent**

↓

**Verification middleware/wrapper**

↓

**Agent executes normally**

↓

**Important action/event captured**

↓

**Verification receipt generated**

↓

**Receipt committed to network**

↓

**Receipt ID returned to application**

This middleware approach could become a major adoption mechanism.

---

# 7. What should actually be verified?

The architecture should avoid the assumption that every piece of AI activity must be written to the blockchain.

Different levels of verification may eventually exist.

Examples could include:

### Execution verification

Evidence that a particular AI execution occurred.

### Model provenance

Evidence relating to which model or model version was involved.

### Agent identity

Evidence that a particular registered agent generated an action.

### Input/output commitment

Cryptographic commitments to an input and/or output without publishing the underlying content.

### Tool usage

Evidence that an agent called a particular tool or external service.

### Decision verification

Evidence that an AI system reached a consequential decision.

### Policy verification

Evidence that specified policy or governance checks were executed.

### Workflow verification

Evidence that particular stages of an agent workflow occurred in a defined sequence.

### Human approval

Evidence that a human approval checkpoint occurred.

These capabilities do not all need to exist immediately.

However, the architecture should avoid unnecessarily preventing their future introduction.

---

# 8. Privacy and off-chain evidence

A critical design principle is that sensitive AI information should **not automatically be written to a public blockchain**.

This includes:

- prompts;
- model outputs;
- personal information;
- proprietary business information;
- customer information;
- documents;
- internal reasoning/context;
- confidential instructions;
- API credentials;
- commercially sensitive data.

The blockchain should generally contain cryptographic evidence rather than the underlying sensitive information.

For example:

**Private evidence**

```text
Customer claim:
...
AI decision:
...
Model:
...
Policy evaluation:
...
```

could produce:

```text
Evidence Package
       ↓
Canonical representation
       ↓
Cryptographic hash / commitment
       ↓
Verification Receipt
       ↓
Blockchain
```

The underlying evidence can remain within the customer's infrastructure or within an appropriately secured commercial evidence store.

Later, the evidence can be rehashed and compared against the blockchain commitment.

This provides proof that the evidence has not subsequently been altered without publicly exposing the evidence itself.

---

# 9. Blockchain explorer

The blockchain explorer remains an important open component.

A user should be able to inspect network activity without paying the commercial company.

For a verification transaction the explorer may display information such as:

- transaction hash;
- block;
- timestamp;
- submitting address;
- verification receipt ID;
- commitment/hash;
- verification status;
- proof metadata where appropriate.

However, the explorer should not expose confidential off-chain evidence.

The distinction should be:

**Explorer = cryptographic/network truth**

**Commercial platform = contextual/business meaning**

This separation is fundamental to the product strategy.

---

# 10. Commercial verification API

The commercial API becomes one of the company's primary products.

An AI company should be able to obtain credentials and begin submitting verification activity without operating blockchain infrastructure itself.

Potential endpoints may eventually include concepts such as:

```text
POST /verify
GET  /verification/{id}
POST /verification/{id}/validate
GET  /agent/{id}/verifications
GET  /audit
```

These are illustrative rather than prescriptive.

The API layer could manage:

- authentication;
- customer accounts;
- rate limits;
- billing;
- token acquisition;
- blockchain transaction construction;
- signing models;
- submission;
- retries;
- transaction confirmation;
- indexing;
- receipt retrieval;
- audit queries;
- usage reporting.

Customers should ideally not need to acquire tokens manually for normal managed API usage.

The commercial platform could abstract token management while still settling the underlying network activity appropriately.

This should be investigated carefully because the mechanism affects custody, regulation, accounting and token economics.

---

# 11. Commercial business model

The company should not depend primarily upon token appreciation.

The token is part of the economics of the decentralised network.

The commercial company should generate conventional recurring revenue.

Potential revenue streams include:

## Verification API

Usage-based pricing for managed verification.

Customers pay the company for making verification easy and reliable.

## Developer subscriptions

Potential plans could include:

- free developer;
- professional;
- startup;
- enterprise.

Paid tiers may provide higher limits, additional analytics, evidence retention and other services.

## Enterprise subscriptions

Enterprise contracts could include:

- dashboards;
- audit tools;
- user management;
- SSO;
- access controls;
- compliance reporting;
- SLAs;
- premium support;
- advanced analytics;
- custom retention;
- private connectivity.

## AI audit and compliance

This may ultimately become one of the most valuable products.

Organisations increasingly deploying autonomous AI systems may require evidence answering questions such as:

- What did this AI system do?
- When did it happen?
- Which agent performed it?
- Which model was involved?
- What information was used?
- Which policies were evaluated?
- Was human approval obtained?
- Has the record subsequently been altered?
- Can this evidence be independently verified?

The commercial platform can transform cryptographic blockchain evidence into a usable enterprise audit system.

## Dedicated infrastructure

Large customers may pay for:

- dedicated gateways;
- dedicated nodes;
- private endpoints;
- guaranteed throughput;
- geographically specific infrastructure;
- higher availability;
- enterprise support.

## Integration and professional services

Early customers may require assistance integrating verification into existing systems.

This can initially generate professional-services revenue while also helping the project understand customer requirements.

Over time, common integrations should become standard product functionality rather than bespoke consulting.

---

# 12. Protocol economics versus company economics

These must be treated separately.

## Network economics

The network contains:

- native token;
- miners;
- mining rewards;
- transaction fees;
- network security;
- token supply;
- emissions;
- ecosystem incentives.

## Company economics

The commercial organisation generates revenue through:

- API usage;
- subscriptions;
- enterprise contracts;
- audit/compliance products;
- infrastructure;
- analytics;
- professional services.

This means a verification transaction may create two economic events.

For example:

```text
Enterprise customer
        │
        │ pays commercial API fee
        ▼
Commercial Platform
        │
        │ submits verification
        ▼
Verification Network
        │
        │ protocol fee/token economics
        ▼
Miners / Network
```

The commercial API price does not necessarily equal the underlying protocol fee.

This allows the underlying verification protocol to remain extremely inexpensive while the company charges for the much broader managed service.

---

# 13. Mining remains strategically important

The introduction of a commercial SaaS/API layer does not eliminate the rationale for mining.

Mining performs two functions.

First, it provides independent network security.

Second, it creates another ecosystem around the project.

The long-term ecosystem potentially contains three major external groups:

### AI developers and companies

Create demand for verification.

### Miners/node operators

Provide independent infrastructure and network security.

### Investors/token holders

Provide capital and economic participation.

These groups can reinforce one another.

More AI verification activity increases network utilisation.

Increasing network utilisation strengthens the economic rationale for operating network infrastructure.

Increasing infrastructure improves decentralisation and credibility.

Greater decentralisation makes independent AI verification more compelling.

The network should therefore continue to support the GPU-mining strategy unless technical testing demonstrates a fundamental reason to reconsider it.

---

# 14. Token utility

The native token should have genuine protocol utility.

Potential utility includes:

- transaction fees;
- verification fees;
- miner rewards;
- network security incentives;
- potentially staking/bonding for certain future network roles if appropriate;
- ecosystem incentives.

However, the commercial strategy should **not rely upon token appreciation to fund ongoing company operations**.

If the commercial platform succeeds, conventional revenue should eventually fund:

- engineering;
- infrastructure;
- DevRel;
- sales;
- support;
- security;
- research and development.

Token value becomes an additional network economic effect rather than the sole business model.

---

# 15. Token allocation

The previous assumption of a conventional retail cryptocurrency presale should be reconsidered.

The preferred direction is currently **not to conduct a mass retail token presale**.

Instead, token allocation should potentially support:

- long-term mining/network rewards;
- ecosystem development;
- strategic AI integrations;
- commercial partnerships;
- developer incentives;
- team incentives;
- foundation treasury;
- institutional/strategic investment.

An illustrative concept discussed has been something approximately resembling:

- substantial long-term mining allocation, potentially around 50%;
- significant ecosystem/commercial/marketing allocation, potentially around 25%;
- remaining allocation across team, foundation/treasury and strategic/institutional investors.

These percentages are **not final**.

Codex should not encode these numbers into protocol economics unless separately instructed.

A detailed tokenomics model will be required before allocations are locked, including:

- total supply;
- emissions;
- mining schedule;
- block rewards;
- fee dynamics;
- dilution;
- treasury;
- vesting;
- team lock-ups;
- investor lock-ups;
- ecosystem grants;
- network security requirements.

Legal and regulatory advice will also be required before investment/token structures are implemented.

---

# 16. Funding strategy

The preferred financing strategy is increasingly based around institutional/private funding rounds rather than a retail token presale.

The objective before significant fundraising should be to demonstrate real adoption.

An initial target should be approximately:

**10–15 external AI companies actively integrating or using the verification network.**

A useful early traction target could additionally be something such as:

**50,000 genuine AI verifications per week.**

The exact number is less important than demonstrating:

- genuine external users;
- repeat usage;
- growing transaction volume;
- production rather than artificial/test activity;
- independent network participation;
- functioning SDK integrations;
- customer retention.

At that stage the investment proposition becomes substantially stronger.

Instead of:

> “We have built a blockchain and would like funding.”

the proposition becomes:

> “We have built an independent AI verification network. External AI companies are already using it, the network is independently secured, verification activity is growing, and we are raising capital to scale adoption and commercialisation.”

---

# 17. Founding AI Partner Programme

A dedicated adoption programme should be created.

Initial objective:

**Recruit approximately 10–15 AI startups as founding integration partners.**

Early targets should primarily be startups and scale-ups where direct access to founders/CTOs/engineering teams is realistic.

The initial programme may provide:

- free integration assistance;
- free API usage;
- engineering support;
- early access;
- direct influence over the roadmap;
- possible ecosystem grants;
- public recognition as a founding partner where desired.

The purpose of the programme is not immediate revenue.

The purpose is to establish:

1. product-market evidence;
2. real-world technical requirements;
3. reference customers;
4. transaction volume;
5. case studies;
6. investor credibility.

The first integrations should therefore be treated partly as product discovery.

---

# 18. Developer ecosystem

A developer ecosystem should be created alongside direct company outreach.

Required assets should eventually include:

- professional public GitHub repositories;
- clear README;
- architecture documentation;
- public testnet;
- explorer;
- faucet;
- SDK documentation;
- API documentation;
- example applications;
- tutorials;
- example AI-agent integration;
- troubleshooting;
- Discord/community;
- developer support;
- contribution guidelines.

The key onboarding objective should be:

> **A competent AI developer should be able to produce their first independently verified AI action within approximately 10 minutes.**

This should eventually become a measurable developer-experience KPI.

---

# 19. Developer grants and hackathons

Once the SDK and testnet are sufficiently stable, adoption can be encouraged through:

- developer bounties;
- integration grants;
- hackathon prizes;
- open-source contributions;
- university AI/blockchain communities;
- AI-agent developer communities.

Early marketing budget should favour **developers actually building things** rather than conventional consumer advertising.

Examples might include rewards for:

- framework integrations;
- SDK improvements;
- developer tooling;
- explorer enhancements;
- AI verification applications;
- enterprise proof-of-concepts;
- novel verification use cases.

---

# 20. Product positioning

External positioning should generally avoid leading with technical blockchain terminology.

The product should not primarily be marketed as:

**“Another Layer 1 blockchain.”**

Preferred positioning should be closer to:

> **Independent verification infrastructure for AI.**

or:

> **The independent verification network for AI.**

A possible concise proposition is:

> **AI can act anywhere. Proof lives here.**

Underlying technologies such as:

- Proof of Work;
- GPU mining;
- EVM compatibility;
- ZK;
- cryptography;
- decentralised nodes,

remain important technical differentiators.

However, they are mechanisms supporting the customer proposition rather than necessarily the first message presented to customers.

---

# 21. Potential long-term enterprise proposition

The ultimate opportunity may extend beyond simply proving that an AI request occurred.

The platform could develop into a broader **AI trust, governance and audit infrastructure**.

For example, an enterprise may operate thousands of autonomous agents.

The verification platform could allow authorised users to investigate:

```text
Agent
  ↓
Execution
  ↓
Model / Version
  ↓
Input commitment
  ↓
Tools used
  ↓
Policy checks
  ↓
Decision
  ↓
Human approval if applicable
  ↓
Output commitment
  ↓
Blockchain verification receipt
```

An auditor could subsequently validate that the historical record corresponds to the cryptographic commitment recorded by the independent network.

This could have particular relevance for industries where AI decisions require strong governance and auditability.

Potential future sectors could include:

- financial services;
- insurance;
- healthcare;
- legal services;
- autonomous commerce;
- AI agents;
- enterprise workflow automation;
- regulated decision systems.

These vertical products should not necessarily be built immediately.

The underlying architecture should, however, avoid unnecessarily preventing them.

---

# 22. New technical workstreams

The existing roadmap is primarily blockchain-focused.

That now needs to change.

The project should be considered as at least five parallel technical/product workstreams.

## Workstream A — Core blockchain

Continue development of:

- consensus;
- GPU mining;
- networking;
- EVM compatibility;
- node operation;
- transaction processing;
- performance;
- security;
- explorer;
- protocol stability.

## Workstream B — AI verification protocol

Develop:

- verification receipt specification;
- evidence commitment model;
- receipt lifecycle;
- cryptographic validation;
- proof handling;
- verification semantics;
- versioning;
- privacy model;
- identity/signing architecture.

## Workstream C — Developer platform

Develop:

- Python SDK;
- subsequent TypeScript SDK;
- API;
- authentication;
- developer accounts;
- documentation;
- examples;
- sandbox/test environment;
- monitoring;
- error handling.

## Workstream D — AI framework integrations

Develop integrations for high-value AI ecosystems.

Initial investigation should include:

1. OpenAI Agents SDK;
2. MCP;
3. LangChain/LangGraph;
4. CrewAI;
5. generic Python applications.

The exact order should be based on adoption potential and implementation complexity.

## Workstream E — Commercial platform

Eventually develop:

- customer accounts;
- API keys;
- usage metering;
- billing;
- verification dashboard;
- agent management;
- audit search;
- receipt retrieval;
- evidence management;
- role-based access;
- enterprise security;
- SSO;
- analytics;
- reporting;
- SLA monitoring.

Not all of this needs to be built before external testing.

The first version should remain deliberately lean.

---

# 23. Immediate MVP

The immediate commercial MVP should avoid becoming an enormous SaaS build.

The minimum useful end-to-end experience could be:

1. Developer creates an account.
2. Developer obtains an API key.
3. Developer installs Python SDK.
4. Developer runs an existing AI agent.
5. SDK captures a selected event.
6. SDK generates an evidence commitment.
7. API submits a verification receipt.
8. Receipt is written to the blockchain.
9. Transaction is independently confirmed.
10. SDK returns verification ID.
11. Developer can retrieve the verification.
12. Public explorer confirms the blockchain record.

If this works cleanly, the project has moved from a blockchain demonstration to an actual AI verification product.

---

# 24. Development roadmap impact

The existing project roadmap should now be reviewed.

Codex should **not discard or rewrite completed blockchain work merely to fit this document**.

Instead, perform a gap analysis.

For every existing development phase:

### Identify

- what has already been completed;
- what is currently being developed;
- what remains;
- which components support the new commercial strategy;
- which assumptions should change;
- which additional components are required.

The roadmap should then introduce the commercial/developer workstreams at the earliest technically sensible point.

It should **not wait until the entire blockchain roadmap is complete** before beginning SDK/API development.

Once the core verification transaction and receipt format are sufficiently stable, SDK and API development should begin in parallel.

This is important because real developers will expose protocol/design problems that internal blockchain testing may not reveal.

---

# 25. Architecture principle: dogfood the API and SDK

Where practical, the project's own example applications and demonstrations should use the same SDK/API exposed to customers.

Avoid maintaining separate privileged integration paths solely for internal demos.

The project should continuously test its own developer experience.

A useful development test should become:

> Can a new AI application be independently verified without the developer needing to understand the blockchain implementation?

If the answer is no, developer experience needs further work.

---

# 26. Metrics

The project should introduce product/adoption metrics alongside blockchain performance metrics.

Existing technical metrics may include:

- TPS;
- block time;
- node count;
- mining performance;
- latency;
- finality;
- proof performance.

Commercial/product metrics should include:

### Primary network metric

**Weekly / Monthly Verified AI Actions**

### Adoption metrics

- registered developers;
- active developers;
- AI companies integrated;
- production integrations;
- active agents;
- verification transactions;
- repeat verification rate;
- verification growth;
- SDK installations;
- API usage;
- customer retention.

### Network metrics

- independent miners;
- independent nodes;
- geographic distribution;
- hash rate;
- network uptime;
- verification latency.

### Commercial metrics

Eventually:

- API revenue;
- ARR;
- paying customers;
- enterprise contracts;
- gross margin;
- average revenue per customer;
- API revenue per verification.

Follower counts, Discord members and social-media impressions should be considered secondary metrics rather than primary evidence of adoption.

---

# 27. Initial traction milestone

A strategically important early milestone should be:

**10–15 independent AI companies using the system**

and approximately:

**50,000 genuine AI verification events per week.**

Combined with:

- functioning public network;
- independent GPU miners;
- explorer;
- production-quality SDK;
- at least one major AI framework integration;
- growing developer community,

this would represent a significant transition point for the project.

At this point the project could reasonably begin preparing for a serious institutional funding process.

---

# 28. Organisational structure

The eventual legal structure requires professional legal, tax and regulatory advice and should not be implemented based solely on this technical document.

Conceptually, however, the architecture should allow separation between:

### Protocol/Foundation

Potential responsibilities:

- open protocol;
- governance;
- network development;
- ecosystem;
- token;
- grants;
- decentralisation.

### Commercial operating company

Potential responsibilities:

- hosted API;
- SDK support;
- enterprise platform;
- dashboards;
- analytics;
- billing;
- customer support;
- commercial integrations;
- enterprise sales;
- professional services.

The final ownership of IP, tokens, treasury and commercial rights must be determined separately with professional advice.

---

# 29. Key strategic principle

The most important change introduced by this document is:

> **The blockchain is infrastructure, not the entire product.**

The project should no longer optimise solely for:

- blockchain performance;
- mining;
- consensus;
- TPS;
- protocol features.

It should optimise simultaneously for:

- developer adoption;
- integration simplicity;
- independent verification;
- enterprise usefulness;
- privacy;
- auditability;
- commercial viability.

A technically excellent blockchain that nobody integrates has little commercial value.

A verification network that becomes a standard component inside AI systems can potentially become valuable infrastructure.

---

# 30. Required Codex review

Before making substantial changes, Codex should inspect the existing repository and current project roadmap.

Produce a **Commercialisation Gap Analysis** covering:

1. Current blockchain architecture.
2. Current status at the end of Phase 4.
3. Existing AI verification functionality.
4. Existing receipt/proof implementation.
5. Existing APIs/interfaces.
6. Existing SDK work, if any.
7. Existing explorer capabilities.
8. Missing components required by this document.
9. Architectural changes required.
10. Components that can be built without changing consensus.
11. Components requiring protocol changes.
12. Security/privacy implications.
13. Dependencies between blockchain and commercial layers.
14. Recommended revised development phases.
15. Which workstreams can begin immediately in parallel.

Do **not** immediately refactor the core blockchain.

First determine the minimum protocol changes required to support the commercial product.

Prefer building commercial capabilities above stable protocol interfaces wherever possible.

---

# 31. Proposed next deliverable

After completing the repository review, produce a proposed revised roadmap.

The roadmap should preserve completed work but expand future phases to include:

**Core Protocol**

**Verification Protocol**

**SDK/API**

**AI Integrations**

**Developer Experience**

**Commercial Platform**

**External Testnet / Developer Programme**

**Founding AI Partner Programme**

**Production Readiness**

**Institutional Funding Readiness**

For each proposed phase specify:

- objective;
- deliverables;
- dependencies;
- architecture changes;
- repositories/modules affected;
- testing requirements;
- security considerations;
- exit criteria;
- which tasks can run in parallel.

Do not begin large-scale implementation until this roadmap has been reviewed.

---

# 32. Final product vision

The long-term system should make the following interaction possible:

```text
                 AI ECOSYSTEM
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   OpenAI Agent   LangGraph       Custom AI
       │              │              │
       └──────────────┼──────────────┘
                      │
               Verification SDK
                      │
                Commercial API
                      │
          ┌───────────┴───────────┐
          │                       │
   Evidence / Audit          Verification
       Platform                 Engine
          │                       │
          └───────────┬───────────┘
                      │
             Cryptographic Receipt
                      │
              OPEN BLOCKCHAIN
                      │
          ┌───────────┼───────────┐
          │           │           │
        Miner       Miner       Miner
          │           │           │
          └───────────┼───────────┘
                      │
              Immutable Proof
                      │
              Public Explorer
```

The developer experiences a conventional AI API.

The enterprise experiences an AI audit and verification platform.

The public sees an independently verifiable network.

Miners secure the evidence.

The token coordinates the network economy.

The commercial company earns recurring revenue by making the network easy, reliable and valuable for organisations to use.

The blockchain therefore becomes the decentralised trust infrastructure underneath a potentially much larger **AI verification, audit and governance business**.

That should be treated as the commercial and product direction against which future development decisions are evaluated.
