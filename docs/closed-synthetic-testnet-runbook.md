# Closed synthetic Base Sepolia testnet runbook

## Purpose

Exercise the loopback ingress API, durable queue, MetaMask-reviewed Base settlement, receipt reconciliation and V2 index lookup using synthetic data only. No customer evidence, production key, public endpoint or automatic broadcaster is in scope.

## Start

Set a locally generated development API key and run the service:

```powershell
$env:AICHAIN_SYNTHETIC_API_KEY = "a-local-development-secret-at-least-16-characters"
npm run base:synthetic-ingress
```

Poll `GET http://127.0.0.1:8787/health`. It reports queued and retained receipt counts, prepared batches, and accepted/rejected/prepared/included counters.

## Test cycle

1. Submit only controlled synthetic presentations to `POST /v1/synthetic/receipts` with `x-aichain-api-key`.
2. Request `POST /v1/synthetic/batches/prepare` when ready to settle. Save its queue batch ID, manifest, transaction data and timestamp.
3. Use the local MetaMask review page or another reviewed local interface to submit the returned zero-value calldata to Base Sepolia.
4. Verify the mined receipt and `ReceiptBatchAnchoredV2` event with the Base verifier.
5. Reconcile the outcome through `POST /v1/synthetic/batches/{queueBatchId}/result` using `{ "result": { "status": "included", "anchor": { ...verified anchor metadata... } } }`.
6. Restart the service and verify `/health` counters, prepared records and queue status remain consistent.

## Initial acceptance thresholds

| Measure | Pass threshold |
| --- | --- |
| Authentication | Missing or invalid API key receives no accepted receipt |
| Synthetic gate | A request without `synthetic: true` is rejected |
| Durability | Accepted and prepared records survive a clean process restart |
| Settlement | Every approved transaction has zero value, the deployed contract address, and a matching V2 event |
| Reconciliation | Included batches transition queued receipts to provisional inclusion exactly once |
| Recovery | A retryable/reorged outcome returns receipts only within the queue attempt limit |
| Privacy | HTTP logs and prepared-batch ledger exclude full presentation payloads |

Record Base fee, confirmation time, queue depth, preparation delay, RPC errors and any recovery action for each batch. Do not expand this environment beyond synthetic traffic until the run completes and its evidence is reviewed.

After two clean two-receipt cycles and a restart-recovery cycle, run one ten-receipt burn-in batch. This remains one zero-value settlement transaction, but validates a non-trivial Merkle proof depth and provides a more useful per-receipt fee observation.

For a confirmed batch, run `npm run base:audit-batch -- <transaction-hash>`. It produces a compact public audit record with three sampled receipt IDs, their Merkle proofs, the confirmed V2 event binding, and read-only on-contract membership checks. It also records observed execution gas; L1 data fees and production relayer overhead must be modelled separately before pricing.
