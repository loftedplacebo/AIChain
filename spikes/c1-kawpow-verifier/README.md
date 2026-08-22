# C1 KawPoW Verifier Spike

This is an isolated, CPU-only Go/CGO adapter around the pinned `cpp-kawpow` submodule. It is **not** linked into Core-Geth, selectable from genesis, used by the VPS/laptop devnet, or a decision to adopt KawPoW.

It proves the minimum integration property required before touching Core-Geth: Go can calculate and verify pinned C1 ProgPoW vectors using the same byte-level inputs that a future consensus engine would receive.

Run on Windows with the project-pinned toolchain:

```powershell
.\scripts\test-c1-kawpow-verifier-spike.ps1
```

The next gate is a Core-Geth adapter design that maps the engine’s seal hash, nonce, mix digest, block number, and difficulty boundary to this spike. That work must remain disabled by default until it has valid/invalid block tests and a migration plan.

