#!/usr/bin/env python3
"""Validate a controlled Phase 4 fault-test plan without executing it."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ALLOWED_KINDS = {"partition", "restart", "reorg", "malformed-submission", "load"}
REQUIRED_KINDS = {"partition", "restart", "reorg", "malformed-submission", "load"}
ALLOWED_TOP = {"schema", "schemaVersion", "target", "approvalRequired", "prohibitedTargets", "experiments"}
ALLOWED_EXPERIMENT = {"id", "kind", "roles", "maxDurationSeconds", "preconditions", "rollback", "expectedInvariants"}
TOKEN = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")


def fail(message: str) -> None:
    raise SystemExit(f"Invalid Phase 4 fault plan: {message}")


def tokens(value: object, field: str) -> list[str]:
    if not isinstance(value, list) or not value or not all(isinstance(item, str) and TOKEN.fullmatch(item) for item in value):
        fail(f"{field} must be a non-empty list of lower-case tokens")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.plan.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(str(error))
    if not isinstance(data, dict) or set(data) != ALLOWED_TOP:
        fail("top-level fields must exactly match the approved schema")
    if data["schema"] != "aichain.phase4-controlled-fault-plan" or data["schemaVersion"] != "0.1.0-draft":
        fail("unsupported schema/version")
    if data["target"] != "closed-testnet" or data["approvalRequired"] is not True:
        fail("target must be closed-testnet with explicit approvalRequired")
    prohibited = tokens(data["prohibitedTargets"], "prohibitedTargets")
    if not {"operational-devnet", "public-network"}.issubset(prohibited):
        fail("must prohibit operational-devnet and public-network")
    experiments = data["experiments"]
    if not isinstance(experiments, list) or not experiments:
        fail("experiments must be a non-empty list")

    ids: set[str] = set()
    kinds: set[str] = set()
    for experiment in experiments:
        if not isinstance(experiment, dict) or set(experiment) != ALLOWED_EXPERIMENT:
            fail("experiment fields must exactly match the approved schema")
        identifier = experiment["id"]
        if not isinstance(identifier, str) or not TOKEN.fullmatch(identifier) or identifier in ids:
            fail("experiment IDs must be unique lower-case tokens")
        ids.add(identifier)
        kind = experiment["kind"]
        if kind not in ALLOWED_KINDS:
            fail(f"unsupported experiment kind: {kind}")
        kinds.add(kind)
        if not isinstance(experiment["maxDurationSeconds"], int) or not 1 <= experiment["maxDurationSeconds"] <= 3600:
            fail("maxDurationSeconds must be between 1 and 3600")
        tokens(experiment["roles"], "roles")
        tokens(experiment["preconditions"], "preconditions")
        tokens(experiment["rollback"], "rollback")
        tokens(experiment["expectedInvariants"], "expectedInvariants")
    missing = REQUIRED_KINDS - kinds
    if missing:
        fail(f"missing required experiment kinds: {', '.join(sorted(missing))}")
    print(json.dumps({"status": "valid", "experiments": len(experiments), "kinds": sorted(kinds)}, indent=2))


if __name__ == "__main__":
    main()
