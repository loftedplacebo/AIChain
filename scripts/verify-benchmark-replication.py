#!/usr/bin/env python3
"""Confirm every transaction in a benchmark report is visible on both devnet nodes."""

import json
import sys
from urllib.request import Request, urlopen


def rpc(url, method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = Request(url, payload, {"Content-Type": "application/json"})
    with urlopen(request, timeout=10) as response:
        reply = json.load(response)
    if "error" in reply:
        raise RuntimeError(f"{url}: {reply['error']}")
    return reply["result"]


def required_receipt(url, transaction_hash):
    receipt = rpc(url, "eth_getTransactionReceipt", [transaction_hash])
    if receipt is None:
        raise RuntimeError(f"{url}: receipt not found for {transaction_hash}")
    if receipt.get("status") != "0x1":
        raise RuntimeError(f"{url}: transaction was not successful: {transaction_hash}")
    if not receipt.get("blockHash"):
        raise RuntimeError(f"{url}: transaction is not confirmed: {transaction_hash}")
    return receipt


def main():
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {sys.argv[0]} benchmark-report.json")

    report = json.load(open(sys.argv[1], encoding="utf-8"))
    transactions = [batch["transactionHash"] for batch in report.get("batches", [])]
    if not transactions:
        raise SystemExit("The report contains no batch transaction hashes.")

    node_1 = "http://127.0.0.1:8545"
    node_2 = "http://127.0.0.1:8546"
    node_1_height = int(rpc(node_1, "eth_blockNumber", []), 16)
    node_2_height = int(rpc(node_2, "eth_blockNumber", []), 16)
    if node_1_height != node_2_height:
        raise SystemExit(f"Nodes are not caught up: node-1={node_1_height}, node-2={node_2_height}")

    for transaction_hash in transactions:
        receipt_1 = required_receipt(node_1, transaction_hash)
        receipt_2 = required_receipt(node_2, transaction_hash)
        for field in ("blockHash", "blockNumber", "status", "transactionHash"):
            if receipt_1.get(field) != receipt_2.get(field):
                raise SystemExit(f"Receipt mismatch for {transaction_hash} field {field}")

    print(f"Replication verified: {len(transactions)} batch transaction(s) on both nodes.")
    print(f"Shared block height: {node_1_height}")


if __name__ == "__main__":
    main()
