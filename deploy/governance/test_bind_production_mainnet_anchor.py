import importlib.util
import json
import pathlib
import stat
import sys
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location(
    'bind_production_mainnet_anchor', HERE / 'bind-production-mainnet-anchor.py')
BIND = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BIND)


class ProductionAnchorBindingTests(unittest.TestCase):
    def test_only_empty_unbound_registry_can_change(self):
        empty = {'version': 1, 'environment': 'prod', 'chain': None,
                 'workers': []}
        candidate = BIND.next_registry(empty)
        self.assertEqual(candidate['chain'], BIND.CHAIN)
        self.assertEqual(candidate['workers'], [])
        self.assertIsNone(BIND.next_registry(candidate))
        with self.assertRaisesRegex(ValueError, 'differs'):
            BIND.next_registry({**empty, 'chain': {
                **BIND.CHAIN, 'contract': '0x' + '11' * 20}})
        with self.assertRaises(ValueError):
            BIND.next_registry({**empty, 'workers': [{}]})

    def test_atomic_install_writes_private_exact_registry(self):
        with tempfile.TemporaryDirectory() as temporary:
            registry = pathlib.Path(temporary) / 'workers.json'
            registry.write_text('{"old":true}\n', encoding='utf-8')
            document = BIND.next_registry({
                'version': 1, 'environment': 'prod', 'chain': None,
                'workers': []})
            with mock.patch.object(BIND, 'REGISTRY', registry):
                BIND.install(document)
            self.assertEqual(json.loads(registry.read_text(encoding='utf-8')),
                             document)
            self.assertEqual(stat.S_IMODE(registry.stat().st_mode), 0o600)
            self.assertEqual(list(registry.parent.glob('.workers-anchor-*')),
                             [])


if __name__ == '__main__':
    unittest.main()
