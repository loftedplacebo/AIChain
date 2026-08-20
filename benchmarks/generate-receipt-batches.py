#!/usr/bin/env python3
"""Generate deterministic, non-sensitive AVR receipt-ID batches and Merkle proofs.

This is a benchmark fixture generator only. Its synthetic receipt IDs are not AVR evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(value: bytes) -> bytes:
    return hashlib.sha256(value).digest()


def receipt_id(index: int) -> str:
    return "0x" + sha256(f"aichain:benchmark-receipt:{index}".encode("utf-8")).hex()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt-count", type=int, required=True)
    parser.add_argument("--batch-size", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.receipt_count <= 0 or args.batch_size <= 0:
        parser.error("receipt-count and batch-size must be positive")

    receipt_ids = [receipt_id(index) for index in range(args.receipt_count)]
    batches = [receipt_ids[index:index + args.batch_size] for index in range(0, len(receipt_ids), args.batch_size)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        "schema": "aichain.avr-batch-benchmark",
        "schemaVersion": "0.1.0-draft",
        "receiptCount": args.receipt_count,
        "batchSize": args.batch_size,
        "batches": batches,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
