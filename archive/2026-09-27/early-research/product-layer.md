# Product Layer: Autonomous Work, Human Certainty

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

## Positioning decision

The product is the **trust and economic layer for autonomous work**.

It enables AI agents to act independently within a clear mandate, while people retain authority over consequential outcomes. It turns completed work into a portable, human-verifiable record.

> **Autonomous agents. Human certainty.**

This is deliberately not:

* an agent operating system;
* a general-purpose agent framework or orchestration tool;
* a standalone permissions or authorization protocol; or
* a token whose value depends on activity for its own sake.

Those categories are important infrastructure, but they do not by themselves answer a practical question: *can a person, business, or another agent trust that autonomous work was authorised, delivered, checked, and paid for?*

Our niche is the layer that answers that question.

## The product promise

An agent should be able to move quickly without asking for a person at every small step. A person should be able to understand, approve, challenge, or stop the decisions that materially matter.

The product provides four connected primitives.

### 1. Agent Passport

An agent has a portable operating identity rather than a disposable session.

The passport expresses its capabilities, reputation, relevant work history, and the organisations or people able to stand behind it. It helps a buyer understand *who is acting* before giving that agent work.

### 2. Mandates

A mandate is a clear brief that gives an agent authority to act within boundaries.

It can state:

* the job or outcome sought;
* a budget and permitted payment rail;
* permitted tools, counterparties, and data boundaries;
* the time period or expiry condition;
* actions that may be delegated; and
* the point at which a human must review, approve, or be alerted.

The goal is not blanket access. It is useful freedom within an intelligible agreement.

### 3. Human Checkpoints

Human review should be selective, not a bottleneck.

Checkpoints are triggered by consequence, uncertainty, novelty, or a mandate threshold: spending above a limit, an unfamiliar counterparty, a safety-sensitive physical action, a low-confidence result, or an unresolved dispute. A person can confirm, reject, request more evidence, pause the agent, or revoke the mandate.

This makes human certainty a product experience rather than an abstract governance claim.

### 4. Work Receipts

Every meaningful completed job can create a signed, portable receipt.

At minimum, a receipt records what was authorised, what was delivered, the agreed payment or value exchange, the relevant verification result, and any dispute outcome. Sensitive task inputs and outputs remain off-chain or private; the receipt carries commitments and evidence references, not a public copy of private work.

The receipt is the bridge between agent autonomy and durable trust. It lets good work improve an agent's future access, reputation, and earning opportunity.

## How the system works

1. A person, business, or agent issues a mandate.
2. An agent accepts work and acts within that mandate.
3. The system requests a human checkpoint only when the mandate or risk signals require it.
4. Payment settles through a predictable rail.
5. A work receipt records the outcome and updates the relevant trust signals.

## Where we start

Start where verification is practical and the value of a trusted record is obvious:

* digital research and analysis;
* procurement and service-agent workflows;
* specialist AI services with clear acceptance criteria; and
* later, robotics and other physical systems where confirmation has especially high value.

Robotics is a compelling future application, but it is not the initial category claim. The product should first prove that mandate, verification, payment, and receipts work for high-volume digital agent tasks. The same primitives can then extend to autonomous systems that affect the physical world.

## Deliberate boundaries

| Adjacent layer | What it does | Our relationship |
| --- | --- | --- |
| Agent operating system | Runs agents, tools, context, schedules, and internal workflows | Integrate with it; do not replace it. |
| Authorization layer | Enforces permissions at the moment an agent takes an action | Supply the business mandate and human-review outcome; reuse its enforcement where appropriate. |
| Payments and settlement | Moves money and quotes prices | Use predictable settlement for the job; record the payment attestation in the receipt. |
| Product layer | Defines trust between the parties to autonomous work | This is our home: mandates, checkpoints, receipts, reputation, and dispute outcomes. |

## Product principles

* **Autonomy is earned and bounded.** Agents should have room to act, but their authority is clear, limited, and revocable.
* **People review outcomes, not every keystroke.** Human attention is used where judgment adds the most value.
* **Useful work beats raw activity.** Rewards and reputation follow paid, accepted, independently checkable outcomes.
* **Privacy is the default.** Publish the proof needed to establish trust, not private prompts, inputs, or outputs.
* **Trust should travel.** A good work history should not be trapped inside one platform.

## Competitive wedge

The initial wedge is not “better agents” and not “more blockchain.” It is the experience of giving an agent a bounded job, knowing when human input is needed, and receiving a trusted completion record.

That creates a defensible focus:

> **The economic and social infrastructure for autonomous work that people can stand behind.**

## Reference projects and lessons

Praxis demonstrates the value of agent identity, scoped tools, authority, state, and an auditable record. These are important integration points, not the category we seek to own. [Praxis Agents OS](https://www.praxis-agents.ai/) and [Praxis AI](https://docs.prxs.ai/) are useful references.

Tessera demonstrates the importance of explicit, scoped, revocable authority and an inspectable decision trail. The product layer should convert that technical authority into a human-readable mandate, checkpoint, and outcome. [Tessera Protocol](https://tessera-protocol.github.io/tessera/)

The recommendations above are product inferences from those references and the project's tokenomics and scaling research. They are not claims of affiliation or compatibility.
