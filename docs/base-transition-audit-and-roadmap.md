# Base transition: repository audit, operations and delivery roadmap

20 September 2026 · Current launch plan under [ADR-0009](decisions/0009-base-launch-settlement.md)

## 1. Outcome

Reuse the engineering code at `C:\AIChain`, preserve the separate website checkout, and retire the own-chain launch workstream from active product delivery. No clone, physical folder move or consensus fork is needed before Base compatibility work. Wallet creation comes next after this review; no credentials were created or changed here.

This is a source-and-operations review, not a Base deployment or full security audit. The principal engineering snapshot was `228a337c67f788ada01b11a78949391274003cae` on `main`, including existing uncommitted documentation. Local repositories were inspected without fetching their remotes, so remote freshness is not established. The earlier settlement analysis used an older HEAD; this review includes the newer rehearsal and recovery evidence.

## 2. Repository decisions

| Source | Findings | Decision |
|---|---|---|
| `C:\AIChain` | GitHub `loftedplacebo/AIChain`; contracts, SDKs, schemas, CI, proofs and operational evidence | Reuse in place as the verification engineering repository. Keep current paths and package imports. No new product repo now. |
| `C:\AIChain\website` | Separate nested Git repository; its own Sites remote; clean working tree at `114e2d4`; 61 tracked files | Preserve repository, remote, working directory, design and deployment. It is not an untracked source folder to add to the parent repo. |
| `C:\AIChain-miner` | Separate GitHub `loftedplacebo/AIChain-kawpowminer`; clean at `e04c574a4`; original GPL miner provenance | Freeze as historical/research source. Do not move into the product, delete, or continue release packaging for Base. |
| `C:\AIChain\node\core-geth` | Separate submodule/fork at `683211f`; clean at inspection | Preserve gitlink, fork and evidence. Not a Base node and not a product runtime dependency. Do not remove submodule during the pivot. |
| `spikes/c1-kawpow-verifier/cpp-kawpow` | Mining dependency declared in `.gitmodules` | Preserve for historical reproducibility; exclude from Base app deployment/build requirements. |
| `spikes/zk-statement` | Selected RISC Zero implementation plus reference/SP1 comparison work | Reuse. Despite the `spikes` name, this contains important proof source and CI inputs. Do not archive all spikes together. |
| `C:\Users\mjgra\OneDrive\Documents\ChatGPT\New Dag` | Older incomplete checkout of the same AIChain remote; extensive pre-existing tracked deletions; untracked strategy/business work | Keep as business/planning workspace for now. Do not use it to build the product, restore deleted protocol source, or commit its deletions as migration. |
| `C:\AIChain-G1-Results`, `G2-Results`, `G3-Results` | Dated historical GPU/interoperability result directories | Preserve as evidence. They are not proof of live GPU fleet membership and are not product repos to clone. |
| Root tarballs, build folders, caches, `devnet` | Snapshots and environment/runtime material | Do not use as authoritative source. No bulk move, deletion or publication. |

### Physical structure now

Keep `contracts/`, `sdk/`, `spec/`, `fixtures/`, `scripts/`, `benchmarks/` and `.github/` in their current engineering locations. Existing code, workflows, fixture loaders and operational scripts refer to these paths. Wrapping everything in a new `development/` directory would create avoidable churn.

Use new `services/` and `integrations/` directories when actual production implementation starts, not empty scaffolding presented as delivered functionality. Keep deployment manifests in `deploy/`, Base-specific helpers in clearly named scripts/configs, and accepted technical decisions in `docs/decisions/`. Existing node paths remain historical.

The independent website repository supplies the website boundary. The business workspace supplies the business boundary. Separate responsibility does not require moving all code into three new folders within one Git root.

### What should eventually move

Make portable, reviewed engineering decisions and release runbooks authoritative in `C:\AIChain\docs`; this audit and ADR establish that home now. Older cross-project documents remain contextual analysis, with pointers to this current plan. Move remaining technical specifications only as they become implementation requirements, preserving provenance and fixing links.

If business documents need shared version control, create a separately access-controlled business repository in a later bounded migration. Include only selected business/planning material with a source/destination hash manifest; never clone the incomplete old protocol checkout as the new product. No confidential document publication or new remote creation is included here.

Do not clone Base's node source for ordinary application development. If a self-hosted node is later justified, use the then-current official operator distribution pinned to a release in a separate infrastructure directory, rather than modifying Core-Geth to imitate it.

## 3. Where the reusable product stands

| Area | Current evidence | Base work remaining |
|---|---|---|
| General receipts | TypeScript and Python `0.4.0-alpha`, salted exact-byte commitments, profiles, context-bound signatures and stream links | Freeze public semantics; signing/package usability; Base destination vectors; independent developer trial |
| Anchor contracts | Individual, batch, authority and historical variants under `contracts/avr-anchor` | Select minimal launch set, public adversarial review, root-reservation fix/design, reproducible Base compilation/deployment |
| Ingress queue | Deduplication, bounded retention, snapshot/restore, small live restart-and-anchor rehearsal | Production transactional acceptance/outbox, concurrent workers, tenancy, fair scheduling, bounded backlog and cost controls |
| Indexer | Durable file cursor/checkpoints, manifest checking, canonical rollback tests and live catch-up evidence | Base observer/finality policy, RPC failover/disagreement, historical lookup and production persistence |
| Audit/identity | Organisational ledgers, signed credentials, historical authority and disclosures | Specify which checks the initial product actually supports; complete export with schema/key/profile history |
| ZK | RISC Zero selected in ADR-0006; individual-proof batches and verifier governance in ADR-0007/0008 | Base-specific verifier compatibility, scope/cost decision, independent review; no automatic proof for every general receipt |
| Python/Go | Python general/legacy receipt code; Go authorised-receipt and policy-statement packages | Preserve conformance; Go is not a complete general-format SDK; do not market parity without tests |
| Hosted API | Local SDK/RPC prototypes and bounded rehearsal exist | Tenant auth, customer interface, custody/retention, durable jobs, secrets, telemetry, quotas, deployment and service ownership |
| Website | Existing independently versioned application; current design accepted by founder | Preserve; narrowly scoped factual corrections only after review, not a new website project |

Important corrections to older summaries: RISC Zero selection and repeated benchmarks already exist, and the latest 19 September rehearsal includes validator recovery, standardized build health, indexer recovery and a small live ingress exercise. These are useful evidence. They do not establish public throughput, production durability or Base compatibility. The older document listing the repeated proof benchmark as outstanding is superseded by ADR-0006 and the repeated benchmark report.

The general-format readiness review explicitly keeps legacy authorised AVR/ZK-001 separate. Preserve that distinction in the API and marketing. A Merkle receipt batch does not verify every proof, and committing proof digests does not perform recursive proof aggregation.

## 4. Mining and existing nodes

### Confirmed versus unconfirmed

- Latest checked-in topology: one RTX 3060 mining host, one VPS CPU validator and one laptop CPU validator, on a disposable KawPoW/ASERT ten-second profile. This is not evidence of several currently running GPU miners.
- Latest documented rehearsal states no rented instance was stopped or deleted. It identifies separate existing Ethash development infrastructure that must not be confused with the rehearsal.
- Read-only local process inspection on 20 September found Ubuntu WSL running and a `core-geth` process with PID 1072. This establishes a process exists, not its role, current head, health or future PID. No local miner process was found in that scoped process-name check.
- Current remote GPU/provider instance status, GPU utilisation, billing rate, host identities and shared workloads were not inspected live. No cloud console or remote SSH operation was performed in this review.

### Recommendation

Stop spending on continuous PoW rehearsal mining once a bounded closeout has preserved its evidence and exact hosts are identified. No additional mining gate is needed to unblock Base development. Keep a local disposable EVM for tests as needed; it does not require a rented GPU or a constantly mining network.

GPU mining and ZK proving are different workloads. Do not retain a mining rental on the assumption that the current proof path needs it. Only keep GPU capacity for proving after an explicit supported prover benchmark justifies that hardware and cost.

### Closeout order for the next operations action

1. Inventory exact provider instance IDs, host roles, process/service names, restart policies, chain/genesis, attached volumes and any shared application/prover workloads. Record costs and service dependencies privately; do not publish credentials or raw host configuration.
2. Stop new rehearsal submissions; drain or record pending work. Export final canonical head/checkpoints, contract addresses, receipts, manifests/proofs, public test reports and source/build hashes. Identify retained private evidence separately.
3. Take a recoverable chain/state snapshot using a clean stop or the client's supported backup procedure; hash artifacts and verify restore/readability. Retain the historical verification material before removing access to its chain.
4. Disable the exact miner supervisor's restart mechanism, then stop the scoped miner and dependent rehearsal services cleanly. Do not use broad process-name kills. Stop chain writers before final state backup if required.
5. Verify mining has stopped and the supervisor cannot respawn it. Verify which validators/relays can safely stop; the VPS could host unrelated services, so do not shut down the whole VPS indiscriminately.
6. Separately stop/cancel the exact rented GPU instance and check its provider billing/storage behaviour. Stopping a miner process is not proof that rental charges stopped. Retain necessary volumes; do not delete instances/volumes as a shortcut to ending compute billing.
7. Remove temporary rehearsal relay access and record closure, retained artifacts, actual costs and rollback instructions. Do not rotate unrelated website or future Base credentials.

This is a reviewable shutdown procedure, not an executed shutdown. The founder asked to consider stopping miners, not to delete unspecified cloud resources. Exact live target identification is the missing input for execution.

## 5. Do we run a Base node?

### Launch decision

No self-hosted blockchain node is required for the first Base integration or launch. Run our API, submission worker, indexer/observer and evidence storage. Connect through a production RPC provider and a separately operated fallback. Public free endpoints are suitable for small experiments, not the launch traffic plan.

Our indexer is application software, not a consensus node. A Base full/deriving node checks and serves chain data; operating one does not give us block-production authority, mining rewards or exemption from transaction fees. Two RPC providers reduce access failures and can detect disagreement, but do not by themselves establish trustless verification.

### When to add our own node

Add one when customer audit requirements call for independently derived execution, provider cost/limits justify it, historical access needs demand it, or operational independence warrants the hardware and on-call burden. Keep RPC fallback even then. Auditors should be able to use their own compatible infrastructure without requiring our node.

Base's current operator documentation points to `base/base`, replacing the older `base/node` repository, and requires Ethereum execution and beacon endpoint access. Pin a supported release and define sync, pruning/history, monitoring and recovery policy. Independent L2 execution still needs an explicit trust model for L1 inputs and checkpoints. An ordinary pruned node does not automatically satisfy every years-later historical proof request. [Base node guide](https://docs.base.org/specifications/node-operators/run-a-node), [hardware guidance](https://docs.base.org/specifications/node-operators/performance-tuning)

Do not repurpose the current Core-Geth binary or its chain database as a Base node. CPU-only validator hardware may be reusable for service work after sizing, but historical tiny-chain resource measurements do not size a full Base node.

## 6. Replacement delivery roadmap

The following B0–B6 milestones are the current product critical path. Historical engineering Phases 0–6 retain their original meanings and results. Own-chain Phase 4/5 acceptance is not a dependency for this Base product launch.

| Milestone | Work | Exit evidence |
|---|---|---|
| B0 — pivot and source ownership | Accept ADR, identify authoritative repos, preserve website, plan mining closeout | This review and ADR; outstanding remote shutdown inventory explicitly recorded |
| B1 — wallets and Base test environment | Dedicated test deployer/relayer roles, Base Sepolia RPC, secret storage, artifact pinning and synthetic deployment | Correct chain identity, secure signing, documented addresses/bytecode and no production funds used |
| B2 — compatible verification slice | Harden minimal batch anchor; create/sign/anchor/export/check receipts; Base-aware finality; negative cases | End-to-end test on Sepolia and independent verification; no signature/destination ambiguity |
| B3 — batch choice and durable service | Compare flat large batches versus hierarchy; transactional outbox, proof retention, tenant limits, recovery and indexer | Measured latency/memory/cost, crash/reorg/RPC-outage tests, explicit batch format and export proofs |
| B4 — audit-ready closed pilot | One real integration, monitoring/intervention profile, key/authority policy, customer custody and auditor-offline-service exercise | Repeated partner workflow and independently reconstructable audit package; no unsupported assurance labels |
| B5 — public developer beta | Versioned SDK/API, docs, rate limits, abuse handling, operational ownership and factual website status correction | External developer completes workflow; explicit testnet/production status; independent review addresses public exposure |
| B6 — paid production on Base | Mainnet signing controls, budget/alerts, security review, recovery/retention drills, customer terms and measured service costs | Release evidence and named operating owners; no automatic mainnet switch from testnet success |

Implement a small reusable vertical slice rather than several throwaway backends. Receipt/schema and contract-address rules must settle before public API commitments. B2 and B3 can inform each other, but freeze the final batch/verifier semantics before external release. Wallet setup in B1 comes after this review as requested; funds, keys and contracts are not provisioned in B0.

### Swim-lane priorities

- Verification/contracts: public-root semantics, signatures, typed assurance, history and audit exports.
- Platform/operations: durable acceptance, scheduler, manifests/proofs, Base submission, finality observer, retention and incident drills.
- Integrations: one selected AI workflow with explicit capture boundary before extra frameworks.
- Website: maintain the current app; no redesign, migration or publishing work in this audit.
- Commercial: only pilot requirements, retention obligations and cost feedback needed to build correctly; defer broad sales/token/exchange work.
- Protocol/mining: preservation and scoped retirement only; no ASIC, new PoW algorithm or consensus expansion on the launch path.

Use responsible roles until staffing is actually assigned. The earlier multi-person/week-number plan was an assumption, not a staffing inventory; no new launch date is promised here.

## 7. Larger and hierarchical batching experiment

Start with a flat Merkle batch closed by maximum age and resource bounds. A ten-second window at the hypothetical 100m/day workload holds roughly 11,574 events. This is a scenario to benchmark, not a recommended fixed batch limit or proven capacity.

Compare flat 1,000, 10,000 and approximately 12,000 event batches with two-level batches using identical receipt inputs, capture policy and export requirements. Measure root-build CPU/memory, manifest size, persisted bytes, proof generation/lookup, API latency, crash recovery and finality delay. Test empty windows, bursts, sparse tenants, urgent flushes, failures and fair scheduling.

If flat batches satisfy the targets, ship flat batching. Hierarchy is justified only by measured needs such as independently sealed tenant batches or distributed aggregation. If used, define domain-separated inner/outer leaf formats, ordering, count semantics, duplicate policy and the two-level membership proof. The current verifier expects direct receipt-to-root membership; opaque contract roots alone do not make hierarchy compatible. Version and test both SDKs and the audit export before shipping it.

The earlier 1.67 ETH/month scenario used 100,000 anchors/day. Ten-second periodic anchoring would use at most 8,640 nonempty anchors/day and gives approximately 0.145 ETH/month at the same sampled per-anchor fee assumptions. This is not a live deployment quote, fee cap or throughput result; proof verification, retries, early flushes and contract changes are additional costs. Storage and processing still scale with evidence volume.

## 8. Website disposition

The website is unchanged, and its clean Git status was checked. No rebuild or deployment was needed for this documentation review.

A small future accuracy patch is warranted: `app/technical/page.tsx` still describes building an own PoW L1 and its shared anchor as L1; `app/whitepaper/page.tsx` states an own-PoW long-term direction; `app/status/page.tsx` leads with historical GPU work. Preserve historical evidence but distinguish it from the accepted Base launch direction. This is a factual maintenance backlog, not a redesign or claim that Base deployment is already live. Existing product pricing remains indicative and should not be silently made final.

## 9. Validation and limits

Fresh TypeScript suite: `node --test sdk/typescript/*.test.js` — **65 passed, zero failed**. Includes receipt, authority, proof-binding, batch, queue, RPC, indexer and audit tests. This validates the reusable local baseline, not Base runtime compatibility.

Python tests could not run in the initially available environments: Windows `python` was absent; WSL and the bundled Python lacked pytest. No dependencies were installed or environments modified for the audit. Prior recorded cross-language results remain historical, not fresh passing results. Contract/prover suites were not rerun, and no claim of a full security audit is made.

Git status was inspected for the engineering, website, miner and Core-Geth repositories. No source checkout was moved, cloned, reset, deleted or published. No miner, validator, cloud instance, wallet or deployment was changed. Remote operational status and cost remain unknown until the scoped retirement inventory is completed.
