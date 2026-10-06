# Bounded periodic Base Sepolia health watcher

`examples/periodic-base-health-agent.py` runs a 48-hour synthetic demonstration
against the operator-owned `Synthetic Validation` project. It checks Base Sepolia
chain ID, latest block progress and presence of the pinned anchor contract; asks
`gpt-4.1-mini` for a `healthy` or `degraded` classification; and submits only that
label plus run metadata through the Python Orvessian SDK. Prompts, RPC responses,
credentials and free-form model output are not recorded. The existing hosted
evidence worker remains the only component with receipt-signing and transaction-
broadcast keys.

The schedule is one check per hour, up to 48 checks and no later than 48 hours
after first start. It persists its run window, sequence, last block and any
unacknowledged event under `/var/lib/orvessian-chain-watch`; restarts never emit
a catch-up burst. Event delivery retries reuse the same event ID and payload.
The OpenAI call has an eight-token output cap and no retry. The model decision
cannot mark the chain healthy if the deterministic chain/contract checks fail.

At current GPT-4.1 mini rates ($0.40 per million input tokens and $1.60 per
million output tokens), even an intentionally conservative allowance of 1,000
input and all 8 output tokens per check is about $0.02 for 48 checks. Actual
cost should be lower for this short prompt. The VPS runs the scheduler; no
OpenAI-hosted sandbox is kept alive. Separately, Base Sepolia publishing remains
subject to the evidence worker's rate, fee and rolling reservation caps.

Before start, verify read-only RPC access with:

```text
python3 examples/periodic-base-health-agent.py --check-only
```

The service unit runs the process as `orvessian-chain-watch`, with a root-owned
environment file and a persistent state directory. Configure these values in
`/etc/orvessian-chain-watch.env`: `OPENAI_API_KEY_B64`, `OPENAI_MODEL`,
`ORVESSIAN_API_URL`, `ORVESSIAN_TOKEN_B64`, `ORVESSIAN_TENANT`, and
`ORVESSIAN_PROJECT`. The secrets are base64-encoded for systemd's environment
parser; the file is readable only by root and the service account. The Orvessian
credential is write-only and project-scoped.
The runtime validates the API origin and model and will not load a chain signer.
