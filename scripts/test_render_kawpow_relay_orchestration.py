#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("render-kawpow-relay-orchestration.py")
SPEC = importlib.util.spec_from_file_location("render_kawpow_relay_orchestration", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def plan():
    key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEJhdGNoUmVwbGFjZVN0cmluZ0ZvclRlc3Rz test"
    return {"schema": MODULE.SCHEMA, "scope": MODULE.SCOPE,
            "relay": {"id": "validator-relay", "address": "203.0.113.100", "port": 22, "user": "relay", "hostKey": key},
            "miners": [
                {"id": "miner-a", "region": "region-one", "address": "203.0.113.10", "port": 22, "user": "root", "p2pPort": 30303, "relayPort": 31001, "relayIdentityPath": "/root/.ssh/miner-a", "relayPublicKey": key},
                {"id": "miner-b", "region": "region-two", "address": "203.0.113.20", "port": 22, "user": "root", "p2pPort": 30303, "relayPort": 31002, "relayIdentityPath": "/root/.ssh/miner-b", "relayPublicKey": key},
            ]}


class RelayPlanTests(unittest.TestCase):
    def test_plan_validation_and_restricted_authorization(self):
        checked = MODULE.validate(plan())
        line = MODULE.restricted_key(checked["miners"][0])
        self.assertIn('restrict,port-forwarding,permitlisten="127.0.0.1:31001",no-pty', line)

    def test_duplicate_relay_port_is_rejected(self):
        invalid = plan()
        invalid["miners"][1]["relayPort"] = 31001
        with self.assertRaises(ValueError):
            MODULE.validate(invalid)

    def test_public_manifest_has_no_endpoint_or_key(self):
        checked = MODULE.validate(plan())
        public = {"relay": {"id": checked["relay"]["id"]},
                  "miners": [{key: miner[key] for key in ("id", "region", "p2pPort", "relayPort")} for miner in checked["miners"]]}
        text = json.dumps(public)
        self.assertNotIn("203.0.113.", text)
        self.assertNotIn("ssh-ed25519", text)


if __name__ == "__main__":
    unittest.main()
