# AIChain KawPoW miner packaging and licensing

Version: 0.1.0-draft · Updated: 2026-09-15 · Status: development policy

## Decision

AIChain will keep the GPU miner separate from the Core-Geth node and from the
AIChain SDKs. The initial implementation is a pinned KawPoW miner fork based on
the externally licensed `RavenCommunity/kawpowminer` revision used by the
Phase 2A measurements. The fork is a development/testnet component, not a
mainnet release or an economic promise.

The first local fork is checked out at `C:\AIChain-miner` from upstream commit
`632f6ea0a5cd09e2c6443374dbe6db0a767715ba`. Its AIChain profile and
loopback-only launcher are committed at `e04c574a417fd663d96d6f4606116e48126793e5`.
It is a local fork milestone, not yet a published GitHub repository or a
production binary.

The miner source is GPL-3.0. AIChain may use, study, modify and run it. If we
distribute a modified miner binary, we must distribute the corresponding source
and build material under GPLv3, preserve copyright and license notices, and
identify our changes. Internal operation and private testing do not require us
to publish private modifications.

This document is an engineering packaging decision, not legal advice. A legal
review is required before distributing a commercial miner package.

## Component boundaries

```text
AIChain node (Core-Geth)       node consensus, CPU seal verification, import
AIChain adapter/launcher       work translation, policy, telemetry, supervision
AIChain KawPoW miner fork      GPU/OpenCL work search; GPLv3 obligations
AVR/ZK/SDK packages            receipts, proofs and application integration
```

The GPL miner must not be copied into or linked into the Core-Geth binary. The
adapter communicates with the node over the explicitly opt-in, loopback-only
development RPC. A node can therefore be deployed without a miner, and a miner
can be distributed without the node source.

## Packaging options

### Option A — pinned upstream plus AIChain launcher

Use the pinned upstream source unchanged and distribute only AIChain scripts,
configuration and documentation around it. This is the smallest-maintenance
path and remains the default until the fork has a measurable benefit.

### Option B — separate AIChain miner fork (selected)

Create a separate `aichain-kawpowminer` repository or release stream. Keep the
fork GPLv3-compatible, publish the modified source with each distributed
binary, record the upstream commit and patch set, and publish reproducible
build instructions and checksums. AIChain-specific changes may include:

- work/submit adapter integration;
- safe defaults, telemetry and thermal limits;
- CUDA/OpenCL build profiles;
- worker supervision, retry and stale-work handling; and
- testnet-only diagnostics.

### Option C — independent implementation (later)

An independently written implementation could use a different license, but it
would require a clean implementation, conformance vectors, CPU/GPU agreement,
security review and a new maintenance surface. It is not required for the
current testnet.

The existing bootstrap remains pinned by default to the measured upstream
commit. A separately hosted fork can be selected without changing Core-Geth:

```bash
AICHAIN_MINER_REPOSITORY_URL=https://github.com/loftedplacebo/aichain-kawpowminer.git \
AICHAIN_MINER_COMMIT=<40-character-reviewed-commit> \
AICHAIN_MINER_BACKEND=cuda \
  bash scripts/bootstrap-kawpow-gpu-host.sh
```

The immutable commit is mandatory; a branch or moving tag is rejected. The
fork must retain the GPLv3 notices and provide corresponding source for any
distributed binary.

The repository includes a non-secret starting profile at
`config/aichain-kawpow-miner.env.example`. Copy it to an ignored local file and
change only the miner repository/commit and GPU backend values that have been
reviewed for the host. Wallets, passwords and pool credentials are deliberately
not part of the profile.

The fork includes a matching non-secret profile and
`scripts/start-aichain-miner.sh`. That launcher validates the backend, requires
an executable miner path, enforces a loopback adapter URL, and starts either
CUDA or OpenCL mode. It does not configure a wallet, pool, public listener or
reward address.

## Rewards and economics boundary

Mining software does not define the monetary policy. A node's consensus rules
may assign temporary devnet subsidy and miners may receive test currency, but
the current networks are closed and valueless. Final block rewards, issuance,
fees, supply limits, pool payouts and any AVR/service rewards remain TBD in the
[Phase 4 economics policy](phase4-testnet-economics-policy.md).

No production reward contract, stablecoin, bridge or public miner market is
implied by this package. Any future application reward contracts are separate
from the PoW miner and must not be treated as consensus issuance.

## Release checklist

- [ ] Confirm upstream license and preserve all third-party notices.
- [ ] Record the exact upstream commit, local patches, toolchain and binary
      checksum.
- [ ] Keep miner source and releases in a separate repository/package.
- [ ] Publish corresponding GPL source for every distributed modified binary.
- [ ] Keep node RPC loopback/private and explicitly opt-in.
- [ ] Verify valid, stale, duplicate, malformed and invalid work cases.
- [ ] Verify CPU-only node import independently of the GPU miner.
- [ ] Do not advertise rewards until economics and issuance are approved.
- [ ] Obtain legal review before commercial distribution.

## Relationship to the roadmap

This closes the packaging/licensing decision needed for Phase 4 preparation.
It does not close the deferred AMD/OpenCL, three-independent-miner,
multi-region, public-testnet or production-economics gates. Those remain Phase 4
and later work in [Next Development Phases](next-development-phases.md).
