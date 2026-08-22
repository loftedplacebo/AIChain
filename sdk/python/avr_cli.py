#!/usr/bin/env python3
"""Small JSON CLI for the Phase 1B AVR draft reference implementation."""

import argparse
import json
from pathlib import Path

from receipt import derive_receipt, prepare_anchor, verify_receipt_against_anchor


def read_json(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("derive", "prepare-anchor"):
        command = commands.add_parser(name)
        command.add_argument("receipt")
    verify = commands.add_parser("verify-anchor")
    verify.add_argument("receipt")
    verify.add_argument("anchor")
    arguments = parser.parse_args()

    receipt = read_json(arguments.receipt)
    if arguments.command == "derive":
        result = derive_receipt(receipt)
    elif arguments.command == "prepare-anchor":
        result = prepare_anchor(receipt)
    else:
        result = verify_receipt_against_anchor(receipt, read_json(arguments.anchor))
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
