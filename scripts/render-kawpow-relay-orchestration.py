#!/usr/bin/env python3
"""Render a private, source-restricted SSH relay plan for disposable miners.

This command performs no network access and makes no host changes. It turns a
private inventory into reviewed tunnel and authorized-key artifacts so relay
setup is reproducible rather than hand-composed during a GPU run.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import shlex
import stat
import sys
import time
from pathlib import Path
from typing import Any

SCHEMA = "aichain.kawpow-relay-plan"
SCOPE = "disposable development network only"
KEY_PATTERN = re.compile(r"^ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9._@-]+)?$")
IDENTIFIER = re.compile(r"^[a-z][a-z0-9-]{1,31}$")


def fail(message: str) -> None:
    raise ValueError(message)


def string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value:
        fail(f"{field} must be a non-empty string")
    return value


def identifier(value: Any, field: str) -> str:
    value = string(value, field)
    if not IDENTIFIER.fullmatch(value):
        fail(f"{field} must be a lowercase deployment identifier")
    return value


def ip(value: Any, field: str) -> str:
    value = string(value, field)
    try:
        ipaddress.ip_address(value)
    except ValueError as error:
        raise ValueError(f"{field} must be an IP address") from error
    return value


def port(value: Any, field: str) -> int:
    if not isinstance(value, int) or not 1 <= value <= 65535:
        fail(f"{field} must be a port number")
    return value


def public_key(value: Any, field: str) -> str:
    value = string(value, field)
    if not KEY_PATTERN.fullmatch(value):
        fail(f"{field} must be one single-line ssh-ed25519 public key")
    return value


def validate(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        fail("unsupported schema")
    if data.get("scope") != SCOPE:
        fail("scope must be disposable development network only")
    relay = data.get("relay")
    if not isinstance(relay, dict):
        fail("relay object is required")
    checked_relay = {
        "id": identifier(relay.get("id"), "relay.id"),
        "address": ip(relay.get("address"), "relay.address"),
        "port": port(relay.get("port"), "relay.port"),
        "user": string(relay.get("user"), "relay.user"),
        "hostKey": public_key(relay.get("hostKey"), "relay.hostKey"),
    }
    miners = data.get("miners")
    if not isinstance(miners, list) or len(miners) < 2:
        fail("at least two miner relay entries are required")
    ids, regions, relay_ports = set(), set(), set()
    checked_miners = []
    for raw in miners:
        if not isinstance(raw, dict):
            fail("each miner must be an object")
        entry = {
            "id": identifier(raw.get("id"), "miner.id"),
            "region": identifier(raw.get("region"), "miner.region"),
            "address": ip(raw.get("address"), "miner.address"),
            "port": port(raw.get("port"), "miner.port"),
            "user": string(raw.get("user"), "miner.user"),
            "p2pPort": port(raw.get("p2pPort"), "miner.p2pPort"),
            "relayPort": port(raw.get("relayPort"), "miner.relayPort"),
            "relayIdentityPath": string(raw.get("relayIdentityPath"), "miner.relayIdentityPath"),
            "relayPublicKey": public_key(raw.get("relayPublicKey"), "miner.relayPublicKey"),
        }
        if not entry["relayIdentityPath"].startswith("/"):
            fail("miner.relayIdentityPath must be an absolute path on the miner")
        if entry["relayPort"] < 1024 or entry["relayPort"] == entry["p2pPort"]:
            fail("miner.relayPort must be a distinct unprivileged port")
        if entry["id"] in ids or entry["region"] in regions or entry["relayPort"] in relay_ports:
            fail("miner ids, regions and relay ports must be unique")
        ids.add(entry["id"]); regions.add(entry["region"]); relay_ports.add(entry["relayPort"])
        checked_miners.append(entry)
    return {"relay": checked_relay, "miners": checked_miners}


def restricted_key(miner: dict[str, Any]) -> str:
    key = miner["relayPublicKey"]
    return (f'restrict,port-forwarding,permitlisten="127.0.0.1:{miner["relayPort"]}",'
            f'no-pty {key} aichain-relay-{miner["id"]}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path, help="absolute private relay-plan JSON")
    parser.add_argument("output", type=Path, help="new absolute private output directory")
    args = parser.parse_args()
    if not args.plan.is_absolute() or not args.plan.is_file():
        parser.error("plan must be an existing absolute file")
    if not args.output.is_absolute() or args.output.exists():
        parser.error("output must be a new absolute directory")
    try:
        checked = validate(json.loads(args.plan.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, ValueError) as error:
        parser.error(str(error))

    args.output.mkdir(parents=True, mode=0o700)
    relay, miners = checked["relay"], checked["miners"]
    # This file deliberately omits addresses, users, keys and identity paths.
    public_manifest = {"schema": "aichain.kawpow-relay-manifest", "schemaVersion": "0.1.0-draft",
                       "createdAt": int(time.time()), "scope": SCOPE,
                       "relay": {"id": relay["id"]},
                       "miners": [{key: miner[key] for key in ("id", "region", "p2pPort", "relayPort")} for miner in miners]}
    (args.output / "manifest.json").write_text(json.dumps(public_manifest, indent=2) + "\n", encoding="utf-8")
    (args.output / "relay-authorized-keys.txt").write_text("\n".join(restricted_key(miner) for miner in miners) + "\n", encoding="utf-8")

    known_host = f'[{relay["address"]}]:{relay["port"]} {relay["hostKey"]}\n'
    (args.output / "relay-known-hosts").write_text(known_host, encoding="utf-8")
    commands = ["#!/usr/bin/env bash", "# Generated private disposable-network relay commands. Review before execution.",
                "set -euo pipefail", "", "# Each command starts a loopback-only reverse P2P relay from one miner to the relay host."]
    for miner in miners:
        command = ["ssh", "-i", miner["relayIdentityPath"], "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes",
                   "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", "-o", "StrictHostKeyChecking=yes",
                   "-o", f"UserKnownHostsFile={args.output / 'relay-known-hosts'}", "-N", "-R",
                   f"127.0.0.1:{miner['relayPort']}:127.0.0.1:{miner['p2pPort']}",
                   f"{relay['user']}@{relay['address']}"]
        commands += ["", f"# {miner['id']} ({miner['region']}): execute on that miner host.", " ".join(shlex.quote(part) for part in command)]
    command_file = args.output / "start-miner-relays.sh"
    command_file.write_text("\n".join(commands) + "\n", encoding="utf-8")
    command_file.chmod(command_file.stat().st_mode | stat.S_IXUSR)
    print(f"Relay plan rendered to: {args.output}")
    print("No host was contacted or modified. Authorize the generated public keys on the relay, then execute each tunnel command on its named miner.")


if __name__ == "__main__":
    main()
