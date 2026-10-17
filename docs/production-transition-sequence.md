# Production transition sequence — 17 October 2026

This is the next execution plan. The existing Contabo/DigitalOcean/B2 pilot
remains a synthetic `test` service with four of five project slots in use. It
does not become production by changing a hostname or WorkOS client ID.

## Current release checkpoint

On 17 October the private Production API was advanced to pinned source commit
`44252f2a12f6f584ecf17af60caa6a29467d8158` with the guarded active
release helper. The previous `ed1f0f7c389392511a145da54026203745b1b13d`
release remains available for rollback. A first candidate correctly rolled
back when its SQL migration files acquired Windows CRLF line endings and no
longer matched the 19 applied migration checksums. The runtime packager now
normalizes SQL migration bytes to LF; its reproducibility test passed, all 19
packaged migrations matched the running release byte for byte, and the
corrected candidate started on a private diagnostic port before activation.
After the switch, the private API, daily Production B2 backup, public
webhook-only edge, and four-worker synthetic pilot checks passed. Production
still has zero projects. The portal and customer API routes remain closed, and
the API's project-creation gate is closed in the deployed release. The current
02:00 UTC backup schedule intentionally rejects any Production project or
worker until the journal-aware handoff passes.
The same private API now has the reviewed Base mainnet contract and public RPC
binding installed through a guarded configuration restart. The read-only RPC
check verified chain `8453`, exact deployed runtime hash and canonical
deployment receipt with 10,091 confirmations before installation. The API,
backup and webhook-only edge passed again afterward. This prepares evidence
inspection; no Production signer, worker, project or receipt has been admitted.
On 17 October the API was advanced again to pinned commit
`ef7ecdd0d1cb79f8aaaa0553f60e216684a37389`. Production evidence
inspection now accepts only the recorder address mapped to that exact
workspace/project; a signer from another project is untrusted even if it can
sign a valid receipt. The protected recorder-map sync reads the root-only
worker registry and restarts the private API with rollback. Its empty map was
installed while Production still has zero projects. Focused signer isolation,
API and evidence tests passed, and the private API, daily Production backup
and synthetic pilot health remained green after activation. The first real
project will require a reviewed registry entry and map sync before evidence
inspection can claim its recorder is trusted.

The [11 October shared-cluster change review](production-shared-cluster-change-review.md)
records the earlier proposal and baseline. The owner has selected the
[Contabo test / DigitalOcean production cutover](production-architecture-cutover-note.md)
instead. Do not apply the shared-cluster proposal as written.
The current [exclusive-cluster change review](production-exclusive-cluster-change-review.md)
records the accelerated backup checkpoint, retirement of six pilot databases
and three pilot roles, and the verified empty production-only bootstrap.

## Selected shape

- **Local development:** private loopback PostgreSQL, API and portal with
  WorkOS Staging. Use short-lived isolated HTTPS previews only for callbacks,
  webhooks or deployment behavior that cannot be checked locally.
- **Pilot:** keep the hosted synthetic portal, API and workers on Contabo and
  move their complete `governance_test` database to PostgreSQL on that VPS.
  Keep the managed pilot database as rollback until local service, backup and
  closed-restore acceptance pass. Keep the five-project cap until measured.
- **Production:** repurpose the existing London DigitalOcean managed PostgreSQL
  cluster exclusively for production after the pilot cutover. Initially run
  isolated production application services on the existing Contabo VPS. Use non-owner production
  API, worker and migration roles, the separate WorkOS Production environment,
  and separate secrets,
  signing/relayer keys, worker journals, and independent encrypted backups.
  Start with WorkOS hosted sign-in. Keep production traffic closed until all
  release checks pass.
- **Availability later:** the reused managed cluster is single-node at launch,
  and the initial application host is shared with the synthetic pilot. Reassess
  a dedicated production VM and a database standby as users, measured capacity
  and an availability target justify their cost. Independent backups and
  replacement-cluster recovery remain required.
- **Evidence chain:** Base mainnet, selected by the owner on 14 October. Do not
  copy the Base Sepolia contract, pilot wallet or test receipts into a
  production approval record. Production receipt acceptance remains blocked
  until the mainnet contract, custody, gas policy and independent verification
  are deployed and tested.
- **Initial RPC:** use Base's public HTTPS mainnet endpoint
  `https://mainnet.base.org` for the first limited-volume customers, including
  the contract deployment. Monitor RPC failures, rate-limit responses and
  evidence delay against the approved 30-minute publishing target. Pause new
  receipt admission if the endpoint cannot support that target. Move the
  production worker to a private provider endpoint before sustained high
  receipt volume, or earlier if public-endpoint reliability or rate limits
  affect publishing. This changes only the RPC transport, not chain ID,
  contract, receipt identities or signed evidence. The staged
  [read-only RPC checker](../scripts/check-production-mainnet-rpc.cjs) verifies
  chain ID, deployed code hash, canonical deployment receipt, confirmations
  and response time without a wallet key. It passed on the VPS against the
  public endpoint on 17 October (225 confirmations, 262 ms). Add an alert for
  failures and rate limits when the first Production worker is activated;
  monitor actual receipt publishing delay from the worker journal as well.

The [version-6 non-secret deployment plan](../deploy/governance/deployment-plan.example.json)
and its validator must be checked against the selected Contabo test database
and exclusive DigitalOcean production cluster before production release.
A valid result is still `releaseReady:false`:
provider account ownership, actual resource IDs, permissions and restore
evidence need independent verification.

Read-only WorkOS account inspection on 10 October found a Production environment
in the original Orvessian project, separate from the pilot project's Staging
environment. The owner added billing information on 11 October and the workspace
now reports `productionState: Active`. The hosted production application has
password sign-in, required authenticator-app MFA and breached-password checks;
public sign-up remains closed. A separate Production API key is now stored
root-only on the VPS; no production customer account has been created. The
current $0 invoice estimate is not a
spending cap; see the [change review](production-shared-cluster-change-review.md)
for optional WorkOS meters and remaining configuration.

## Execution order

| Gate | Work | Completion evidence |
| --- | --- | --- |
| 1. Local development | Recheck the existing private PostgreSQL cluster, loopback API and WorkOS Staging configuration; run sign-in and one synthetic local customer journey. | No pilot or production credentials in local data; API readiness, scoped keys and session tests pass. |
| 2. Pilot database cutover | Install local PostgreSQL on Contabo, migrate the complete pilot database under a writer pause, repoint services and health checks, then verify backup and closed restore. Keep the managed copy as rollback until acceptance. | Receipts, projects, key revocations, worker journals, B2 backup, closed restore and health all pass. |
| 3. Production cluster preparation | The reviewed on-demand coordinated B2 backup and independent closed restore passed. Six named managed pilot/restore databases and three pilot roles were retired. The `governance_prod` database and restricted roles were created and verified. The admin credential was rotated. Restrict trusted sources when the production app endpoint exists. | No pilot object remains on the managed cluster; production bootstrap and admin rotation passed. Network restriction remains open. |
| 4. Production identity | Configure WorkOS Production hosted AuthKit, MFA, exact HTTPS callbacks and signed webhook; create new production API key and sealing key in protected storage. | Fresh production account passes sign-in, MFA, recovery, revocation and webhook replay tests; staging identities are not assumed to transfer. |
| 5. Runtime and backup | Build pinned API, worker and portal artifacts; apply migrations and strict roles in the production database; deploy isolated production users, directories, units and loopback ports on Contabo behind private readiness checks. Configure production-specific encrypted backup, journals, retention and alerts that do not silently reuse the pilot backup set. | Green release gates, hashes, scoped read/write/denial checks in both databases, shared-host fault isolation, current production backup marker and every worker registered. |
| 6. Recovery | Restore when the original managed DB cluster is unavailable, review every journal and access state, then activate an isolated replacement service. | Measured recovery point and time, revoked captured access, receipt proof preservation and successful post-restore customer journey. |
| 7. Public acceptance | Finish abuse, security and privileged-access review; legal pages, support/privacy/security inboxes, real-data terms, capacity and incident rehearsal. Decide and test production evidence chain. | Owner go/no-go record and claims limited to tested capacity and recovery. |

On 14 October the owner selected **Base mainnet** for the first real-customer
Production receipts. The [Base JSON-RPC specification](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId)
identifies mainnet chain ID `8453`. The owner funded the production wallet and
deployed the reviewed anchor contract on 17 October. No Production publishing
service has been activated. The owner selected the public Base mainnet RPC for the first
limited-volume production phase, with the move to a private endpoint governed
by the monitoring trigger above. Base describes the public endpoint as
[free, best-effort and subject to lower read rate limits](https://status.base.org/).
The current pilot
publisher and receipt path are pinned to Base Sepolia chain ID `84532` and
synthetic events, so reusing them unchanged would produce the wrong Production
claim. Before the Production worker starts, implement and test mainnet-specific
receipt IDs and presentation verification, deploy and fingerprint the reviewed
anchor contract, bind the worker journal and database role, set bounded gas
and nonce recovery policy, and verify an independently exported mainnet proof.
The protected Production worker registry has been installed empty; its future
entries are constrained to chain ID `8453` and must match the project catalog
and each journal. The verified contract address and runtime code hash were
bound to the still-empty protected registry on 17 October by the
[read-only-check-first binder](../deploy/governance/bind-production-mainnet-anchor.py).
It independently rechecked the deployment (160 confirmations), used the
registry lock and an atomic root-only replacement, and left zero workers.
The first project journal and worker environment still need this exact binding.
The receipt preparation, API inspection and independent export verifier now
accept an explicit reviewed chain, contract and runtime code hash binding.
Production API startup rejects a configured Base Sepolia binding; without a
mainnet binding its authenticated evidence route returns 503. The existing
pilot defaults remain pinned to Base Sepolia. Synthetic mainnet proof tests
pass. The worker engine now uses the same explicit binding for provider checks,
batch preparation, transaction signing and saved-byte retry review, with
regression tests for pilot behavior and wrong-chain rejection. The separate
[Production worker launcher](../scripts/governance-production-worker.cjs) and
[inactive service template](../deploy/systemd/orvessian-production-project-worker@.service)
now require a prebound `prod` journal, exact mainnet anchor and expected signer
addresses, verified TLS to `governance_prod` as `governance_prod_worker`, and a
bounded policy. A `--preflight` path reads the database, RPC and contract code
without writing the journal or sending a transaction. Focused launcher and
recovery-binding tests pass. The worker release is staged, but no key copy,
worker login or unit instance has been activated, so this is not yet a live
mainnet publisher.
The deterministic runtime packager has a `production-worker` mode that includes
the locked Node dependencies without changing the pilot worker archive.
[The initial worker release helper](../deploy/governance/stage-production-worker-release.py)
requires an exact archive SHA-256, the reviewed unit-template hash and an
empty protected Production worker registry. It stages code and installs the
template disabled; it does not create an instance, copy a wallet key or start
publishing. Its synthetic Linux staging test and the packager tests pass.
Compile the candidate contract with
`node scripts/compile-base-sepolia-anchor.cjs --mainnet`; the resulting local
artifact is ignored under `build/base-mainnet/`. Its reviewed runtime hash is
`0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f`
with Solidity 0.8.24, optimizer 200 runs and Paris EVM. After an independently
approved mainnet deployment, set an HTTPS `GOVERNANCE_MAINNET_RPC_URL` and run
`node scripts/verify-base-mainnet-deployment.cjs <contract-address> <deployment-tx-hash>`.
The read-only verifier requires chain 8453, exact runtime bytes, successful
contract creation, canonical block hash and at least 12 confirmations. A
contract address alone only reports a runtime-code match and exits nonzero.
The deployed contract is
`0xcF3A904b433c50E2d4F6E2a0d692E855d33910f2`, transaction
`0xa32ab8f5a704ecf300b3b4a1de943952f33d1efd6dceed201a16b98191e27626`
in Base mainnet block `52719601`. The read-only verifier checked the
canonical block hash, creation receipt, exact reviewed runtime code hash and
17 confirmations (minimum 12) on 17 October. The Production receipt path is
still closed.
`node scripts/prepare-base-mainnet-deploy.cjs` produces the ignored
`build/base-mainnet/deployment-manifest.json` with the exact unsigned creation
bytes, source artifact digest and expected runtime hash for wallet review. It
does not select a signer, access a wallet or broadcast a transaction.
The owner chose one owner-controlled wallet for deployment and unattended
publishing and approved a hidden-prompt transfer to a protected VPS file.
`ReceiptBatchAnchor` has no owner or administrator role: the deployer receives
no persistent contract privilege. The same wallet still controls its ETH and
publisher identity, so the key must not appear in chat, arguments or logs.
The [wallet installer](../deploy/governance/configure-production-mainnet-wallet.py)
derives and displays only the public address, stores the key root-only under
`/etc/aichain/production`, and leaves all services off. On 17 October the
owner-installed wallet resolved to public address
`0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3`; the VPS file was checked
as root-owned, regular and mode `0600` without reading its contents. Its
disposable-key Linux test passed. Worker access remains a separate reviewed
step.
The [two-step mainnet deployment operator](../scripts/deploy-base-mainnet-anchor.cjs)
now pins the reviewed creation hash
`0xccf23437b086cba0f033a19c353ca582953b1e725e57c59798fb43531c06d1ce`
and runtime hash
`0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f`.
`--quote` reads the protected wallet and HTTPS RPC without signing;
`--prepare <max-fee-wei> <max-total-wei>` signs exactly one contract
creation transaction into a root-only intent file without broadcasting;
`--status` checks that hash; and `--broadcast` can transmit only the saved
bytes. `max-fee-wei` bounds the signed L2 gas price; `max-total-wei` is a
review threshold for the estimated L2 maximum plus Base L1 data and operator
fees, checked again immediately before broadcast. The additional fees can
change before inclusion, so this is **not** an absolute on-chain spend cap.
The operator fails closed if the Base fee oracle cannot be queried. It checks
chain 8453, balance, pending nonce, expected empty contract address and the
returned transaction hash. Any uncertain broadcast result is
reviewed by hash before a retry; a new nonce cannot be silently substituted.
Its synthetic tests cover fee estimates and fee changes, chain, balance,
nonce, intent tampering and idempotent broadcast behavior. On 15 October the
initial public operator script, its
manifest helper and the exact compiled artifact were staged in the separate
root-owned `/opt/aichain/orvessian-mainnet-deploy` directory with source
SHA-256 hashes
`6f5f9f8a9141fa6c34f3fe769e201d30db731c1709bcc6cc9bd02d0fd7b709a4`,
`43caaa32c590a50acd94121650c71a1aa1974be7efb9c2cd375c3a60a0edc08b`,
and `1af5044041280f1177ee31eecc780aa8e057e09df8ba8bb4bf6743d87767872d`.
The runtime dependencies were copied from the pinned, inactive Production worker
artifact so this one-time operator does not depend on a future worker release
replacement. The fee-aware revision supersedes the initial staged operator
script. The deployed staged script's SHA-256 is
`1c071f476c759e0e2be0b1ef0b882896f1b90dd3165bcc4622c14793132390aa`.
A read-only quote before funding returned nonce 52 and an estimated total
near 0.00000756 ETH. The wallet was funded to about 0.01000009 ETH. The
original signed intent was 5.5 KB and exceeded the operator's 4 KB private
file reader limit, so the first broadcast attempt never reached the RPC. The
reader limit was corrected to 64 KB for the root-only intent; all four
synthetic Linux tests passed. The exact saved transaction was then broadcast
through the public RPC and independently verified after 17 confirmations.
No Production worker was activated by the deployment.
The Production prelaunch backup and private API health check remained healthy
after the registry binding, with zero projects and no worker journals.
The owner approved a distinct restricted relayer wallet for each Production
project, including the first ten design partners. The owner-controlled wallet
will deploy the contract and fund each relayer with a small capped amount under
a reviewed funding policy; its private key must not be copied into a worker.
This prevents independent workers from racing the same transaction nonce.
Production project creation is now denied by default in the API source until
the per-project provisioning, funding, worker registration and journal-aware
backup handoff have passed acceptance. This source gate is not yet deployed;
the customer routes at the public edge remain closed. A later reviewed release
must provide an explicit admission switch with a verified readiness check.
The [first-cohort worker preparer](../deploy/governance/provision-production-project-worker.py)
now has a candidate operator path for an **existing** Production project. It
requires the exact current project catalog and pinned worker release, creates
separate worker-owned recorder and relayer keys, prebinds a private mainnet
journal, and registers a paused worker. It refuses to run if another project is
uncovered or the target worker unit is active. The default mode is a read-only
preflight; `--apply` prepares the paused worker. The candidate funding policy
caps the target balance at **0.0002 ETH per relayer** (at most 0.002 ETH of
targets for ten projects, plus transfer fees); no funding transaction has been
sent. The private owner wallet never enters a worker environment. Five offline
Linux tests passed, including actual disposable key generation and journal
identity checks. This tool does not create the customer project, enable a
worker, or switch backups. The first project must be handled in a supervised
window, followed by a journal-bearing B2 upload, closed restore, timer handoff,
and independent receipt acceptance before general project admission.
An integration test found that the staged Production worker rejected every
SQLite journal larger than 4 KiB because it reused the private-key file limit.
The reviewed fix keeps keys at 4 KiB and permits a bounded worker-owned journal.
The corrected Linux worker artifact from commit
`ba47cb8140c7ea7ecb12e57bd52c52007f6a43d2` has SHA-256
`382b1987af4e15300ae40b7078f26086d5901b4f5e4b2a4edfa081b3eaf8635f`.
Five worker tests and five provisioner tests passed on Linux, including the
actual staged worker journal reader. The pinned replacement preflight accepted
5,889 archive members and replaced the **inactive** worker release on 17 October.
The prior `fa2b929e05f0` artifact remains available; the staged protected
rollback helper passed its read-only rollback preflight. The root-only
provisioner was staged with matching SHA-256
`41b66b7decc23d8d9cb8d243b55626b16fb350f7b1e2440b6b0aad79a46bb9c9`.
Production prelaunch backup, private API and synthetic pilot health stayed green;
there are still zero Production projects, zero worker instances and no funding
transaction.
The [restricted worker database installer](../deploy/governance/configure-production-worker-database.py)
passed a read-only live preflight and two offline success/rollback tests. On
17 October it changed `governance_prod_worker` from `NOLOGIN` to a restricted
login after verifying the Production schema and grants. Its generated database
URL is stored in a root-owned `0600` file on Contabo; the secret was not printed.
The worker service remains off and the prelaunch backup health check stayed
green. The worker login is ready for per-project protected environments, but
no project or evidence publisher has been activated.
The first Production worker artifact was built on Linux from source commit
`76a89ae1b6ffca41c8a0b0ed6d9a834a67e19371` with locked runtime
dependencies and install scripts disabled. Eleven focused Linux tests passed.
The deterministic artifact SHA-256 is
`11deabf3d1604edf6c18c6523b951ec9102b954848f4e7261e630d99883792c5`
with 5,885 regular-file members. The [pinned staging helper](../deploy/governance/stage-production-worker-release.py)
rejects a different source commit or artifact hash. On 15 October it staged
the archive at `/opt/aichain/orvessian-production-worker` and installed the
unit template with SHA-256
`b55aff6ce94a7f652f719f60afe6695282e70af9d900b8afbe2f053714b5e889`.
The unit remains disabled with no instances; the Production prelaunch backup
and synthetic pilot health checks were green after staging.
The worker's read-only preflight was strengthened to compare an existing
journal identity with the selected project, publisher, recorder and contract
before it reports ready. An updated Linux artifact from commit
`fa2b929e05f0a3069054b935e0c0aa28e2ba860f` passed 12 focused tests and
has SHA-256
`7c2f8cb49a8f62df43fac38f76e7a70bda14cdcb5bab61e6051ceadcf1ba549a`.
The [offline replacement helper](../deploy/governance/replace-production-worker-release.py)
pins both commits and archive hashes, requires a disabled template and empty
worker inventory, and retains the prior artifact for exact rollback. On
15 October it replaced the inactive release and retained
`/opt/aichain/orvessian-production-worker.previous-76a89ae1b6ff`; the
post-change Production backup and pilot checks were green. No worker instance,
wallet key or public customer route was activated.

The [production API unit](../deploy/systemd/orvessian-production-api.service)
uses a distinct Unix identity, release directory, protected environment file
and private loopback port 8791. It is installed, active and enabled for signed
WorkOS revocation delivery. Nginx exposes only the exact webhook route; other
customer API routes remain closed until their release gates pass.
The separate [production portal unit](../deploy/systemd/orvessian-production-portal.service)
defines an isolated `orvessian-prod-portal` identity and
loopback port 3003. It binds the exact Production portal/API origins and sets
`WORKSPACE_ENVIRONMENT=prod`, which keeps public sign-up closed. Its non-login
Unix account, root-owned empty release directory and disabled, inactive unit
were staged on Contabo on 14 October. A pinned website artifact was then
built and tested privately; live identity and API integration remain required
before any `prod` customer route
opens. The portal gateway deliberately refuses a public portal origin paired
with a loopback API URL, so its private integration check must retain the
reviewed HTTPS origin/Host boundary without exposing customer routes.
The [shared-host baseline and isolation audit](production-shared-host-capacity-and-isolation-2026-10-14.md)
records current VPS and managed-database headroom and checks cross-environment
credential access. These point-in-time checks do not establish a load limit.
The [portal host staging helper](../deploy/governance/stage-production-portal-host.sh)
checks the exact unit hash and pilot service health, then creates only its
non-login Unix identity, root-owned empty release directory and disabled,
inactive unit on `--apply`. The shell syntax and read-only preflight passed
on the VPS, then `--apply` staged the unit. Independent checks found the unit
disabled/inactive and `prod.orvessian.com` still returning 404; the pilot
health check remained green. This did not deploy a portal artifact, start a
listener or alter Nginx.
The clean website source commit `3da61c634d7fa0f359a44ca2ede5726fa2d0b946`
was archived with SHA-256
`c8dc5a08e6324bd795086dab5111ba429c6d7698522f0a19b5228272c5044c7c`.
On the VPS, `npm ci --ignore-scripts`, typecheck, build and the full website
release suite passed (44/44 tests). The pinned Production portal archive SHA-256
is `55ca21e645dcaa670d25047338e0fbab0cc966613e89ace94e019b52c4cabfad`.
The [release helper](../deploy/governance/stage-production-portal-release.sh)
verified its hash and staged it into the isolated Production portal directory.
An independent [archive verifier](../deploy/governance/verify-production-portal-archive.py)
checked 23,209 members, including 37 symlinks contained within the package,
against the pinned hash and unpacked-size bound. The root-owned
[provenance manifest](../deploy/governance/production-portal-release.json)
was installed alongside the inactive artifact; the strengthened helper now
requires both that manifest and the archive verifier on future staging runs.
A private start served `/` and `/workspace` with HTTP 200 on loopback port
3003; the public `prod.orvessian.com` route remained 404. The service was
stopped after verification and remains disabled/inactive. A live WorkOS
sign-in and API journey still need acceptance before opening customer routes.
The [host staging helper](../deploy/governance/stage-production-api-host.sh)
can create the non-login API identity, empty root-owned release directory and
disabled unit earlier. Its default mode is read-only; `--apply` never starts a
service or creates an HTTPS route. Install a pinned API artifact and complete
the private preflight before enabling the unit.
Build the production API artifact from a pinned Linux checkout using Node 24,
`npm ci --omit=dev --ignore-scripts`, and the shared deterministic packager's
`--component api` option. Record the Git SHA and archive SHA-256. Inspect the
archive for `scripts/governance-production-api.cjs`, the PostgreSQL and WorkOS
dependencies, and absence of secret files. Stage it in the root-owned release
directory while the unit remains disabled. The
[release staging helper](../deploy/governance/stage-production-api-release.py)
checks the pinned archive hash, allowed file types, size and required members;
its default mode is read-only. `--apply` fills the empty production directory
and writes a non-secret release manifest, then confirms the unit is still
disabled and inactive. This initial staging operation does not enable the
public route or replace a live production release.
For later inactive replacements, the
[offline release helper](../deploy/governance/replace-production-api-release.py)
requires the exact current commit, new commit, archive SHA-256 and a disabled,
inactive unit. Its default mode is read-only. `--apply` retains the prior
release under an exact-commit rollback path before switching directories;
`--rollback --apply` reverses that swap while the unit remains off. It does
not restart services or change public routing.
On 11 October its pinned unit hash and read-only preflight passed, then
`--apply` staged `orvessian-prod-api` with `/usr/sbin/nologin`, the empty
root-owned `/opt/aichain/orvessian-production-api` directory, and
`orvessian-production-api.service`. Independent `systemctl show` reported
`UnitFileState=disabled` and `ActiveState=inactive`; the synthetic pilot health
check remained green. No production environment file, database login, public
route or customer traffic was activated at that host staging checkpoint.

The pinned Linux checkout `271c129f752cffd8095e9fbdc7b0339d3390f0d8`
installed lockfile dependencies with npm install scripts disabled. Its API
archive SHA-256 is
`c266034f172a43e41b84ea405281a31193a6d0d9799fbbbff25968a601e00055`.
The archive contains the production entry point and required runtime packages,
and no secret-named files. The read-only release preflight accepted 5,877
members before the archive was staged in the root-owned production release
directory. The release manifest records both hashes; the production unit
remained disabled and inactive, port 8791 stayed closed, and the synthetic
pilot health check remained green. The targeted Linux API and WorkOS tests
passed 38/38; two website gateway tests require the separate website checkout
and were covered in the earlier local full suite. This staged artifact is
private preparation, not production runtime or customer acceptance.

On 10 October, the existing isolated local `dev` PostgreSQL cluster started,
the loopback API returned HTTP 200 for `/health` and `/ready` and HTTP 401 for
an anonymous `/v1/session`, then both processes were stopped. This is a
readiness check for Gate 1, not the full browser, MFA or receipt journey.

On 11 October, the WorkOS Production AuthKit callback, logout return, web
origin, homepage and initiate-login URL were configured for the temporary
`prod.orvessian.com` preparation hostname. MFA remains required and public
sign-up closed. The [production identity change review](production-identity-change-review.md)
records the application-side closed-admission guard and the remaining live
host, credentials, webhook and account acceptance work. No production user
exists yet. The revocation-only webhook was registered on 13 October under
the owner's approved short transition. Its signing secret and exact HTTPS
route are now installed; a real signed delivery still needs to be accepted.

Keep the existing portal/API hostnames on the pilot during preparation. Use
separate temporary production hostnames on Contabo and register their exact
WorkOS callbacks. Plan the eventual domain switch and rollback only after the
new services pass end-to-end acceptance. Do not import pilot users, workspaces,
API keys or testnet evidence as live customer records by assumption.
The authoritative DNS is currently at GoDaddy. `prod.orvessian.com` and
`api-prod.orvessian.com` were added on 13 October as A records pointing to
the existing Contabo IPv4 address. Both resolved from the authoritative
GoDaddy nameserver. The [closed Nginx preparation](../deploy/nginx/orvessian-production-preparation.conf)
serves HTTP ACME challenges and returns 404 on every other HTTP or HTTPS
path. A separate Let's Encrypt certificate was issued for both names, expiring
11 January 2027, with automatic renewal registered. Nginx validation passed,
both HTTPS names returned 404 with valid TLS, and pilot health remained green.
This provides host and certificate preparation only: no production API, portal,
customer traffic, HTTPS proxy or WorkOS webhook endpoint is active yet.

## Budget and later VM decision

The initial plan adds **no DigitalOcean application VM**. The existing
2 GiB/1 vCPU managed PostgreSQL Standard single-node cluster costs about
**$30.45/month** already and is now exclusively for production. The local
PostgreSQL 17 test cluster and initial production app services use existing
Contabo VPS capacity. A separate 4 GiB/2 vCPU Basic Droplet remains a later
**$24/month** list-price option. These estimates exclude production backup
storage, transfer, DNS, monitoring, taxes and other services. Measure shared
host and database load before customer traffic. Sources:
[DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets) and
[Managed Databases](https://www.digitalocean.com/pricing/managed-databases).

The existing database is single-node, with 2 GiB RAM, 30 GiB storage and a
displayed 47-connection limit. The pilot no longer shares its database
connections or cluster maintenance. The production app initially shares the
Contabo host's CPU, memory, disk and administrator failure domain with the
pilot. DigitalOcean states that Standard
Edition standby availability changes from 15 October 2026 for new accounts
and 30 November for existing accounts; do not assume a low-cost Standard
high-availability upgrade will remain available. A required availability SLA
would need a fresh design and quote. [DigitalOcean PostgreSQL pricing and
plan notice](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/).

WorkOS says hosted AuthKit is free under its stated 1-million-monthly-active-
user allowance, but Production still requires billing information and its
configuration is separate from Staging. The optional branded custom login
domain is deferred. [WorkOS environment guidance](https://workos.com/docs/authkit/environments)
and [pricing](https://workos.com/pricing).

No new VM was ordered. Before a later VM purchase, prepare exact resource
settings, budget and rollback record. Production traffic, real customer data
and mainnet funding require later, separate go/no-go decisions.

## Database release conditions and standby review

The pilot database was copied and accepted on Contabo on 11 October 2026,
including its worker registry, key revocations, fresh receipt proof, encrypted
off-host backup and independent closed restore. The managed pilot copy remains
the rollback source until the reviewed on-demand B2 backup and independent
closed restore pass. The owner accelerated this checkpoint on 11 October;
the unattended 12 October backup remains a separate operational check. The
six managed pilot databases and three old roles have now been retired under
the exact-object change review, and the empty production database created. Rotate the
managed administrator password before production use and restrict trusted
sources to the production application and reviewed operator access.
After rotating it in DigitalOcean, run the protected
`configure-production-database-admin.py` installer on Contabo at a hidden
terminal prompt. It verifies the new credential against `governance_prod`
over verified TLS and stores it under `/etc/aichain/production`; the managed
inventory then prefers that production credential. Retire the obsolete pilot
operator copy after dependent historical tools have been reviewed.

The reused cluster has `governance_prod` and three restricted production roles.
On 11 October the owner rotated the managed `doadmin` password and installed it
through the protected VPS prompt, and installed a separate WorkOS Production API
key through a second protected prompt. The guarded schema helper then applied
all 19 pinned migrations and the reviewed API and worker grants. Its verification
found the `prod` environment marker, active recovery gate and no `PUBLIC` table
grants; it returned the migration role to `NOLOGIN` with no password. Independent
inventory found zero production database connections and all three roles still
`NOLOGIN`; the production API remained disabled and the synthetic pilot healthy.
The separate production API login was then generated on the VPS with a SCRAM
verifier, and its own database URL and 32-byte identity sealing key were stored
in `/etc/orvessian-production-api.env` as `root:root 0600`. The API role passed
the runtime profile's exact grant and denial check. Only that API role has
`LOGIN`; migration and worker roles remain `NOLOGIN`. The API unit is still
disabled and inactive, and its environment file is deliberately incomplete
until signed WorkOS webhooks and closed admission are configured. The worker
login and scheduled production backup remain open. Never put `doadmin` in a service.
On 13 October the [guarded runtime installer](../deploy/governance/configure-production-api-runtime.py)
added the reviewed `prod` PostgreSQL profile, Production client/callback,
closed owner-only admission list and loopback port to that root-only environment
file. The installer required an exact three-field base file and an inactive,
disabled unit; its focused tests passed. Post-install inspection found
`root:root 0600`, the expected variable names, an inactive/disabled production
unit, and healthy pilot coverage. At that checkpoint the WorkOS signing
secret was absent and service activation remained gated.
The separate [hidden-prompt webhook installer](../deploy/governance/configure-production-workos-webhook.py)
remains staged but was not used. After the owner approved a brief 404 delivery
window, WorkOS Production endpoint `we_01M4VBTD55EZZQWYRHARZX79GN` was
registered for `session.revoked` at
`https://api-prod.orvessian.com/v1/auth/workos-webhook`. The public route
initially remained 404 while the signing secret and edge were prepared;
there were no Production users or sessions. An alternate guarded
[API installer](../deploy/governance/install-production-workos-webhook-from-api.py)
can fetch that exact endpoint's secret using the existing protected Production
API key directly on the VPS and install it without printing or copying it to
the operator laptop. It requires an inactive, disabled Production API unit,
root-only key file, exact endpoint URL and event scope, and a usable signing
secret. Its local tests passed. An account usage limit briefly delayed the
SSH approval reviewer; deployment resumed when review became available. The
[webhook-only Nginx config](../deploy/nginx/orvessian-production-webhook-only.conf)
opens only the exact signed-revocation path after the API service starts;
all other Production paths stay closed. The production entry point permits its
**read-only private preflight** to verify the restricted database and closed
identity binding without a webhook secret; normal service startup still
requires the secret. The targeted production/WorkOS tests passed 31/31 with
loopback access. The pinned Linux replacement artifact from commit
`f7987c1d0e23` has SHA-256
`4e104c7fe98dd96c7fc37990191eedaccc66137d0bf16c34e26c7e206eb5bf60`.
It passed the exact-commit/hash replacement preflight (5,878 members), then
replaced the inactive API release with the previous `271c129f752c` release
retained for offline rollback. A transient systemd preflight ran under the
restricted `orvessian-prod-api` Unix user with protected environment files;
it returned `status: ready`, `database: verified`,
`identity: closed-admission-prepared`, and `webhook: pending`. The persistent
API unit remained disabled; no production endpoint was proxied at that
checkpoint.

Later on 13 October, the API installer verified the exact WorkOS endpoint,
event scope and active status, then installed its signing secret directly on
the VPS. WorkOS returned an unmasked 25-character alphanumeric secret rather
than the `whsec_` prefix assumed by the first installer version; a metadata-
only diagnostic identified the format, and the corrected installer passed
local tests before the one-time install. The secret value was never printed.
The protected WorkOS file is `root:root 0600` with only the API key and webhook
secret variable names. Private preflight returned `database: verified` and
`webhook: configured`.

The first normal API start exposed a code gap: `createReadiness` rejected
the `prod` environment although private preflight accepted it. A restricted
PostgreSQL-only Production readiness path was added in commit
`ed1f0f7c389392511a145da54026203745b1b13d`; its Linux startup,
readiness and signed-webhook tests passed 10/10. The Linux API archive SHA-256
is `c58f5094ead77cbc4e80c50a2e7fc8327fd1c36810778da283af440384cf5228`.
The guarded release helper accepted 5,878 members and replaced the inactive
`f7987c1d0e23` release, retaining it for rollback. Private preflight passed
again, then the Production API started on loopback. Local `/health` and
`/ready` returned 200; anonymous `/v1/session` and an unsigned webhook POST
returned 401.

The [webhook-only Nginx config](../deploy/nginx/orvessian-production-webhook-only.conf)
was applied with the [guarded edge helper](../deploy/governance/activate-production-webhook-edge.py).
It retained the original 404-only config for rollback, passed `nginx -t`,
and verified the exact public webhook path returns 401 for unsigned POSTs.
Independent HTTPS checks confirmed HTTP 401 with a valid certificate, while
the public API `/health` stayed 404. The pilot health check remained green.
The Production API is active and enabled for reboot continuity; all customer
API and portal routes remain closed. A real signed WorkOS delivery, replay
and revocation test is still required before Production identity acceptance.

### Revocation webhook activation and rollback

The completed host change was limited to signed `session.revoked` delivery. Pin the
source commit and copy the exact API installer and webhook-only Nginx template
to the VPS. Before applying either, confirm the WorkOS endpoint ID, URL,
active status and sole event, that the production API unit is inactive and
disabled, and that the pilot health check is green. Run the installer as root;
its only successful output states that the secret was installed and hidden.
Check root ownership, mode `0600` and the presence of the two expected
variable **names** in `workos.env` without printing their values. Then rerun
the production API private preflight and require `webhook: configured`.

Start the production API on loopback while its unit remains disabled. Require
HTTP 200 from local `/health` and `/ready`, HTTP 401 from anonymous
`/v1/session`, and HTTP 401 from an unsigned local POST to the WorkOS webhook.
If any check fails, stop the unit and leave Nginx on its 404-only preparation
config. After those checks pass, save the current Nginx config for rollback,
install the webhook-only config, require `nginx -t`, then reload Nginx. With
valid TLS and the intended Host/SNI, require an unsigned POST to the exact
public webhook path to return HTTP 401; `api-prod` `/health`, every other API
path and `prod` `/` must remain HTTP 404. Recheck pilot health and the API
unit, then enable the API unit for reboot continuity while the customer routes
remain closed. A production account/session must still prove a signed
delivery, replay and revocation before admission opens.

If the public route or pilot health check fails, restore the saved 404-only
Nginx config, test and reload it, disable and stop the production API unit,
then verify the webhook path is back to HTTP 404. The WorkOS endpoint can be
disabled separately if delivery will remain unavailable; do not confuse that
with revoking the signing secret. Record the before/after config hashes,
checks, timestamps and service states. No test assertion on an unsigned
request proves a valid signed WorkOS delivery.

The historical shared-cluster SQL bundle is not a release artifact here.
An isolated backup runner was staged from pinned commit `08774a1` with no
service. A distinct 32-byte production archive key was generated on the VPS;
the key and its directory are `root:root 0600` and `0700`. The key still needs
independent escrow. A quiesced production database snapshot was encrypted and
authenticated locally as backup `b864dbc2-20f1-40ef-864a-465ff7fab884`.
This capture has no worker journals because no production worker exists yet.
The production API had not yet been activated and the synthetic pilot health check passed.
The capture was subsequently uploaded to the separate production B2 bucket,
discovered through its completion marker, downloaded with a separate read key,
and authenticated in a fresh closed restore. Independent archive-key escrow and
replacement-cluster recovery remain open.
The existing `capture-production-backup.py` and
`upload-production-backup-b2.py` are one-time, quiesced bootstrap tools:
capture requires the production API disabled and zero database connections,
upload refuses an existing latest-upload pointer, and both require an empty
worker-journal list. Do **not** attach them directly to a timer or describe
their initial snapshot as ongoing protection. Before the API or worker becomes
customer-facing, add a recurring runner that coordinates every production
writer, reads a protected production worker registry, authenticates the
complete journal set, safely advances the private B2 pointer only after a
completion marker, and checks each scheduled window. A production account
with no project may be tested during closed preparation, but this gate still
precedes open admission.
A [prelaunch runner](../deploy/governance/run-production-prelaunch-backup.py)
and [daily timer](../deploy/systemd/orvessian-production-prelaunch-backup.timer)
have been prepared for the closed Production database with **zero projects**.
The runner fails if a project or a named Production worker exists, stops the
private API for the quiesced capture, restarts and checks it even after a
capture failure, then uploads through the restricted production B2 key and
advances the private pointer only after the remote completion marker. Its
read-only preflight passed on the VPS; five guard, restart, upload-order,
due-window and inactive-portal status tests passed, and the systemd templates
passed verification. The guarded
[activation helper](../deploy/governance/activate-production-prelaunch-backup.sh)
also passed its read-only VPS preflight, including pilot health and webhook
isolation. On 14 October the owner approved the recurring off-host upload and
brief API pause. The timer was installed, enabled and started for 02:00 UTC;
the first run was started immediately. Backup
`969f6ed6-86d6-4b62-a2c0-6089fbf28e24` uploaded successfully and the API
restarted. The health check reported `healthy: true`, a valid completion marker,
covered due window, successful service, active timer and API, and an inactive
portal. This is not the journal-aware production backup needed once project
creation opens; the prelaunch runner deliberately refuses nonzero projects or
named production workers.
The encrypted archive library now accepts only `worker_<24-hex>` SQLite
journals for `prod`, checks the Production journal schema and marker, and
restores them behind `review-required`. This is a core capability, not an
activated backup schedule. The running prelaunch timer still rejects every
Production project and worker. A separate coordinated runner, remote upload,
closed restore and worker-by-worker review must pass before onboarding opens.
The candidate `run-production-journal-backup.py` is separate from the active
timer. It requires an exact Production project catalog, registered mainnet
workers and matching private journals, checks the pinned journal-aware archive
code, then quiesces the portal, every worker and API for one encrypted database
and journal capture. It authenticates the archive before B2 upload and tries to
restart every previously active writer even if capture fails. Synthetic Linux
tests cover catalog rejection and the stop/capture/upload/restart sequence.
On 15 October the journal-aware archive core was staged beside the live
prelaunch runner in the immutable, root-only
`/opt/aichain/orvessian-production-journal-backup-runner-61a063e` directory.
[The staging helper](../deploy/governance/stage-production-journal-backup-runner.py)
checks the base release manifest and old core hashes before overlaying the two
reviewed journal-aware files, whose SHA-256 hashes were verified on the VPS.
This staging does not switch the active 02:00 timer or enable a worker. The
candidate operator runner and B2 drill point at this separate release;
their synthetic Linux tests passed. A real worker-bearing capture, B2 upload,
closed restore and replacement-cluster recovery are still required before
the journal-aware schedule can replace the prelaunch timer.
The candidate journal-aware B2 drill is
`verify-production-journal-b2-restore.py`. It requires the latest Production
completion pointer to name the exact registered worker set, authenticates the
B2 download, restores to the manual-start loopback PostgreSQL recovery cluster,
then checks each restored journal's project, signers, Base mainnet contract and
`review-required` gate. The zero-journal prelaunch drill retains its existing
scope. Synthetic Linux tests cover pointer rejection, download-to-restore
scope forwarding and restored-journal identity. A real B2 worker-journal
upload and closed restore has not yet occurred.
After a successful journal-bearing B2 download and closed restore review, the
drill atomically writes the root-only
`/var/lib/aichain-production-backup/journal-restore-acceptance.json` marker.
It records the exact backup ID, B2 prefix, worker roles and Base mainnet chain
binding, without credentials. The read-only
[`check-production-journal-handoff.py`](../deploy/governance/check-production-journal-handoff.py)
requires that marker to match the current B2 completion pointer and registered
workers, and requires the prelaunch timer to be active while the journal timer
is disabled. A newer upload invalidates an older acceptance. This checker
prepares the operator review; it does not switch either timer. Its Linux
synthetic tests cover successful acceptance, failed-restore non-acceptance,
changed worker scope, stale acceptance and incorrect timer state.
The inactive [journal backup service](../deploy/systemd/orvessian-production-journal-backup.service)
and [02:00 UTC timer](../deploy/systemd/orvessian-production-journal-backup.timer)
are prepared for the handoff. The separate
[journal backup health checker](../deploy/governance/check-production-journal-backup-health.py)
requires the latest completion pointer to list every registered worker role,
checks the complete Production project catalog and journal bindings, all
worker units, the due upload window, the new timer and API, and confirms the
prelaunch timer is disabled. Its synthetic Linux coverage and pointer-mismatch
test passed. Neither timer has been switched: the prelaunch timer remains the
active guard for the still-empty Production database.
The guarded [timer handoff helper](../deploy/governance/activate-production-journal-backup.py)
requires the exact latest journal-bearing B2 set, its closed restore
acceptance, and pinned service and timer units before switching from the
zero-project timer. It checks the new timer and complete journal backup
health, then attempts to restore the prior timer if acceptance fails.
Synthetic Linux tests cover the switch and failed-health rollback. This
helper has not been applied: Production still has no project, worker journal
or accepted journal-bearing restore.
The journal backup runner and restore/handoff checks are staged on Contabo.
The missing journal health checker was staged and its synthetic test passed;
the reviewed service and timer templates passed `systemd-analyze verify` and
were installed with the timer **disabled and inactive**. The existing
prelaunch timer remained enabled and active, and its coverage check was green
after installation. Installing these unit files did not run a journal backup.
The [read-only health checker](../deploy/governance/check-production-prelaunch-backup-health.py)
checks the 02:00 UTC schedule with a 03:00 due threshold. A fresh download with
the separate Read Only B2 credential authenticated the first scheduled set.
The health check now reads the protected Production database marker and project
count and inspects both expected worker unit names; it reports unhealthy if a
project or worker appears while the journal-free schedule is still installed.
The closed restore into local database `gov_restore_prod_a84935dfc666` passed
with restored access revoked and disabled. This tests the Contabo loopback
recovery cluster; a replacement-host or replacement-managed-cluster activation
drill remains open.
On 12 October a separate private, encrypted-at-rest B2 bucket named
`orvessian-prod-backups-2026` was created in `eu-central-003` at
`https://s3.eu-central-003.backblazeb2.com`. It initially had the default
"keep all versions" lifecycle. Before production admission, configure reviewed
retention rules, scheduled upload and journal inventory. Stored objects count
toward the account-wide 10 GB free allowance and can create usage charges
beyond it.
On 13 October, bucket- and `orvessian-production/prod/`-scoped B2 keys were
created: one Write Only upload key and one Read Only restore key. The first
restore key's one-time secret was not saved, so it was deleted and replaced
with key ID ending `00005`. Both active credentials were installed root-only
on Contabo. The owner approved the exact off-host transfer of snapshot
`b864dbc2-20f1-40ef-864a-465ff7fab884`. Its authenticated upload wrote a
completion marker to the private production bucket. The separate restore key
downloaded and authenticated that B2 set, then a fresh closed restore passed
as `gov_restore_prod_e0a19d786e0a` with access revoked and disabled. The
managed source database was untouched and the production API stayed disabled.
The local capture `b864dbc2-20f1-40ef-864a-465ff7fab884` was authenticated
and restored on 12 October into a separate manual-start PostgreSQL 17 cluster
bound to `127.0.0.1:5441`. Fresh database `gov_restore_prod_e6fa3bf836a0`
passed closed review with access revoked and disabled. The managed source was
not touched, the production API remained disabled and inactive, and pilot
health passed afterward. This drill used the **local** archive on the same
Contabo host. The subsequent B2 drill proves off-host custody and an
authenticated download, but still does not satisfy independent archive-key
escrow, a different-host recovery, or production service activation acceptance.

Measure production peak connections, memory, disk, query latency and evidence
backlog under the proposed limited workload. Set a conservative connection
budget and alerts. The reused cluster is single-node; document measured
recovery time and avoid an untested availability claim. Review a standby and
its current price and plan availability after launch when paying customers or
an availability commitment justify the expense.
