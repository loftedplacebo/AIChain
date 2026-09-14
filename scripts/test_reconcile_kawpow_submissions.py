#!/usr/bin/env python3

import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("reconcile-kawpow-submissions.py")
SPEC = importlib.util.spec_from_file_location("reconcile_kawpow_submissions", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class FakeRPC:
    def __init__(self, block, head):
        self.block = block
        self.head = head

    def call(self, method, params):
        return self.block if method == "eth_getBlockByHash" else self.head


class ReconciliationTests(unittest.TestCase):
    def test_loopback_only(self):
        self.assertEqual(MODULE.loopback_url("http://127.0.0.1:8545"), "http://127.0.0.1:8545")
        with self.assertRaises(Exception):
            MODULE.loopback_url("http://192.0.2.1:8545")

    def test_canonical_and_orphaned_results(self):
        block_hash = "0x" + "11" * 32
        block = {"hash": block_hash, "number": "0x10"}
        self.assertEqual(MODULE.canonicality(FakeRPC(block, {"hash": block_hash}), block_hash), "canonical")
        self.assertEqual(MODULE.canonicality(FakeRPC(block, {"hash": "0x" + "22" * 32}), block_hash), "orphaned")
        self.assertEqual(MODULE.canonicality(FakeRPC(None, None), block_hash), "not-found")


if __name__ == "__main__":
    unittest.main()
