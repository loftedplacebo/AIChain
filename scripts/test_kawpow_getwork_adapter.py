#!/usr/bin/env python3

import importlib.util
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("kawpow_getwork_adapter.py")
SPEC = importlib.util.spec_from_file_location("kawpow_getwork_adapter", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FakeNode:
    def __init__(self):
        self.calls = []
        self.result = {"accepted": True, "status": "accepted", "blockHash": "0x" + "44" * 32}

    def call(self, method, params):
        self.calls.append((method, params))
        if method == "aichain_getKawpowWork":
            return {"version": MODULE.WORK_VERSION, "workId": "0x" + "11" * 32,
                    "headerHash": "0x" + "22" * 32, "seedHash": "0x" + "00" * 32,
                    "target": "0x" + "33" * 32, "height": "0x1", "expiresAt": "0x1"}
        return self.result


class AdapterTests(unittest.TestCase):
    def test_getwork_and_submit_translation(self):
        node = FakeNode()
        adapter = MODULE.Adapter(node)
        self.assertEqual(adapter.get_work(), ["0x" + "22" * 32, "0x" + "00" * 32,
                                              "0x" + "33" * 32, "0x1"])
        accepted = adapter.submit_work(["0x" + "aa" * 8, "0x" + "22" * 32, "0x" + "bb" * 32])
        self.assertTrue(accepted)
        self.assertEqual(node.calls[-1][0], "aichain_submitKawpowWork")
        self.assertEqual(node.calls[-1][1][0]["workId"], "0x" + "11" * 32)

    def test_unknown_and_malformed_work_rejected(self):
        adapter = MODULE.Adapter(FakeNode())
        self.assertFalse(adapter.submit_work(["0x" + "aa" * 8, "0x" + "22" * 32, "0x" + "bb" * 32]))
        with self.assertRaises(ValueError):
            adapter.submit_work(["0x01"])
        with self.assertRaises(ValueError):
            adapter.dispatch("eth_getWork", [1])

    def test_audit_log_records_nonsecret_solution(self):
        node = FakeNode()
        with tempfile.TemporaryDirectory() as directory:
            audit = Path(directory) / "audit.jsonl"
            adapter = MODULE.Adapter(node, audit)
            adapter.get_work()
            adapter.submit_work(["0x" + "aa" * 8, "0x" + "22" * 32, "0x" + "bb" * 32])
            self.assertIn('"status":"accepted"', audit.read_text(encoding="utf-8"))

    def test_loopback_policy(self):
        for host in ("127.0.0.1", "::1", "localhost"):
            self.assertTrue(MODULE._loopback_host(host))
        for host in ("0.0.0.0", "192.0.2.1", "example.com", None):
            self.assertFalse(MODULE._loopback_host(host))
        with self.assertRaises(ValueError):
            MODULE.NodeRPC("http://192.0.2.1:8545")


if __name__ == "__main__":
    unittest.main()
