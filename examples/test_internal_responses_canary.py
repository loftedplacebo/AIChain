import importlib.util
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

MODULE = Path(__file__).with_name('internal-responses-canary.py')
spec = importlib.util.spec_from_file_location('internal_responses_canary', MODULE)
canary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(canary)


class FakeClient:
    def __init__(self):
        self.records = []

    def register_agent(self, **_kwargs):
        return {}

    def record_run(self, **kwargs):
        self.records.append(kwargs)
        return {'status': 'accepted', 'eventId': kwargs['event_id']}

    def evidence(self, event_id):
        return {'event': {'eventId': event_id}, 'evidence': {},
                'verification': {'state': 'confirmed'}}


class CanaryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.write, self.read = FakeClient(), FakeClient()
        env = {'CANARY_STATE_FILE': str(Path(self.temp.name) / 'state.json'),
               'CANARY_NODE': 'node', 'GOVERNANCE_RECEIPT_SIGNERS': '["0x' + 'ab'*20 + '"]',
               'GOVERNANCE_EVIDENCE_RPC_URL': 'https://sepolia.base.org',
               'CANARY_VERIFY_SCRIPT': 'synthetic-verifier.cjs'}
        self.patch_env = patch.dict(os.environ, env)
        self.patch_env.start()
        self.addCleanup(self.patch_env.stop)
        self.patch_clients = patch.object(canary, 'clients', return_value=(self.write, self.read))
        self.patch_clients.start()
        self.addCleanup(self.patch_clients.stop)
        self.patch_secret = patch.object(canary, 'secret', return_value='synthetic-key')
        self.patch_secret.start()
        self.addCleanup(self.patch_secret.stop)

    def test_one_model_call_and_one_receipt_per_day(self):
        calls = []
        model = lambda key: calls.append(key) or 'review'
        day = datetime(2026, 10, 8, 9, tzinfo=timezone.utc)
        self.assertEqual(canary.run(day, model_call=model,
                                    export_check=lambda *_args: 0), 0)
        self.assertEqual(canary.run(day, model_call=model,
                                    export_check=lambda *_args: 0), 0)
        self.assertEqual(len(calls), 1)
        self.assertEqual(len(self.write.records), 1)
        self.assertEqual(self.write.records[0]['event_id'], 'canary-20261008')
        self.assertEqual(self.write.records[0]['predicted_label'], 'review')

    def test_uncertain_attempt_does_not_spend_again(self):
        day = datetime(2026, 10, 8, 9, tzinfo=timezone.utc)
        path = Path(os.environ['CANARY_STATE_FILE'])
        canary.save(path, {'version': 1, 'date': '2026-10-08',
                           'phase': 'started', 'eventId': 'canary-20261008',
                           'decision': None})
        self.assertEqual(canary.run(day, model_call=lambda _key: self.fail('duplicate model call'),
                                    export_check=lambda *_args: 0), 1)
        self.assertEqual(len(self.write.records), 0)

    def test_prior_unverified_receipt_blocks_next_day(self):
        day = datetime(2026, 10, 8, 9, tzinfo=timezone.utc)
        path = Path(os.environ['CANARY_STATE_FILE'])
        canary.save(path, {'version': 1, 'date': '2026-10-08',
                           'phase': 'submitted', 'eventId': 'canary-20261008',
                           'decision': 'review'})
        self.assertEqual(canary.run(day + timedelta(days=1),
                                    model_call=lambda _key: self.fail('new model call'),
                                    export_check=lambda *_args: 0), 1)

    def test_one_operator_retry_is_recorded_before_provider_call(self):
        day = datetime(2026, 10, 8, 9, tzinfo=timezone.utc)
        path = Path(os.environ['CANARY_STATE_FILE'])
        canary.save(path, {'version': 1, 'date': '2026-10-08',
                           'phase': 'started', 'eventId': 'canary-20261008',
                           'decision': None, 'attempts': 1})
        def fail_after_spend(_key):
            self.assertEqual(canary.load(path)['attempts'], 2)
            raise RuntimeError('synthetic provider failure')
        with self.assertRaises(RuntimeError):
            canary.run(day, model_call=fail_after_spend,
                       export_check=lambda *_args: 0, operator_retry=True)
        with self.assertRaises(RuntimeError):
            canary.run(day, model_call=lambda _key: (_ for _ in ()).throw(RuntimeError('third failed')),
                       export_check=lambda *_args: 0, operator_retry=True)
        self.assertEqual(canary.load(path)['attempts'], 3)
        with self.assertRaises(RuntimeError):
            canary.run(day, model_call=lambda _key: (_ for _ in ()).throw(RuntimeError('fourth failed')),
                       export_check=lambda *_args: 0, operator_retry=True)
        self.assertEqual(canary.load(path)['attempts'], 4)
        with self.assertRaises(ValueError):
            canary.run(day, model_call=lambda _key: self.fail('fifth call'),
                       export_check=lambda *_args: 0, operator_retry=True)


if __name__ == '__main__':
    unittest.main()
