# Scaling Plan

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

This is a long-term planning document. As the protocol and product are built, evaluate design decisions against the scaling path below: high-volume AI activity is executed and receipted off-chain, aggregated by execution layers, and finally settled on the L1.

```text
               AI WORLD
    ┌────────────┬────────────┬────────────┐
    │ AI Agent A │ AI Agent B │ AI Agent C │
    └─────┬──────┴─────┬──────┴──────┬─────┘
          │            │             │
   millions of AI actions / receipts
          │            │             │
          ▼            ▼             ▼

 ┌───────────────────────────────────────┐
 │     RECEIPT / EXECUTION LAYERS        │
 │                                       │
 │  Rollup 1   Rollup 2  ... Rollup N   │
 │                                       │
 │  Batch receipts                       │
 │  Construct Merkle trees               │
 │  Generate ZK proofs                   │
 └──────────────────┬────────────────────┘
                    │
             aggregated proofs
                    │
                    ▼

          ┌─────────────────────┐
          │    YOUR L1          │
          │                     │
          │ Core-Geth / EVM     │
          │ GPU PoW             │
          │ AI Receipt Registry │
          │ ZK Verification     │
          │                     │
          │ Final settlement    │
          └─────────────────────┘
```
