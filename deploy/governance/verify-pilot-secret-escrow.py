#!/usr/bin/env python3
"""Compare owner-entered escrow copies with the protected pilot runtime values."""

import getpass
import hmac
import os
import sys


RUNTIME_FILE = "/etc/aichain-governance-synthetic-api.env"
CHECKS = (
    ("WorkOS API key", "WORKOS_API_KEY"),
    ("WorkOS webhook signing secret", "WORKOS_WEBHOOK_SECRET"),
    ("identity sealing key", "GOVERNANCE_IDENTITY_SEAL_KEY"),
)


if os.geteuid() != 0 or not sys.stdin.isatty():
    raise SystemExit("Run as root in an interactive SSH terminal")

required = {name for _, name in CHECKS}
expected = {}
with open(RUNTIME_FILE, encoding="utf-8") as runtime:
    for line in runtime:
        name, separator, value = line.rstrip("\n").partition("=")
        if separator and name in required:
            expected[name] = value

if set(expected) != required:
    raise SystemExit("Protected runtime file is missing a required value")

matches = []
for label, name in CHECKS:
    entered = getpass.getpass(f"1Password {label}: ").strip()
    matches.append((label, hmac.compare_digest(entered, expected[name])))
    entered = None

for label, matched in matches:
    print(f"{label}: {'MATCH' if matched else 'DOES NOT MATCH'}")

if not all(matched for _, matched in matches):
    raise SystemExit(1)

print("All three escrow copies match the protected pilot runtime file.")
