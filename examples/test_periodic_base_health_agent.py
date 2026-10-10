"""Offline one-run guard for the internal synthetic project check."""
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).with_name('periodic-base-health-agent.py')
SPEC = importlib.util.spec_from_file_location('periodic_base_health_agent', SOURCE)
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class FakeClient:
    def __init__(self):
        self.records = []
        self.registrations = 0

    def register_agent(self, **_kwargs):
        self.registrations += 1
        return {'status': 'accepted'}

    def heartbeat(self, **_kwargs):
        return {'status': 'accepted'}

    def record_run(self, **kwargs):
        self.records.append(kwargs)
        return {'status': 'accepted'}


class OneRunTests(unittest.TestCase):
    def test_one_run_is_durable_and_idempotent(self):
        client = FakeClient()
        signals = {'expectedChain': True, 'blockAvailable': True,
                   'contractPresent': True, 'priorBlockKnown': False,
                   'blockAdvanced': True}
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'state.json'
            with patch.dict(os.environ, {'AGENT_STATE_FILE': str(path)}), \
                    patch.object(AGENT, 'secret_env', return_value='sk-fake'), \
                    patch.object(AGENT, 'make_client', return_value=client), \
                    patch.object(AGENT, 'observe_chain', return_value=(signals, 1)), \
                    patch.object(AGENT, 'classify', return_value='healthy') as classify:
                self.assertEqual(AGENT.main(once=True), 0)
                first = json.loads(path.read_text(encoding='utf-8'))
                self.assertEqual(first['attempts'], 1)
                self.assertEqual(first['accepted'], 1)
                self.assertIsNone(first['pending'])
                self.assertEqual(len(client.records), 1)
                self.assertEqual(AGENT.main(once=True), 0)
                self.assertEqual(len(client.records), 1)
                self.assertEqual(client.registrations, 1)
                self.assertEqual(classify.call_count, 1)


if __name__ == '__main__':
    unittest.main()
