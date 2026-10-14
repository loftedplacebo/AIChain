"""Closed restore drills must never expose customer routes or need API downtime."""

import importlib.util
import pathlib
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    'production_restore_service_state',
    pathlib.Path(__file__).with_name('production_restore_service_state.py'))
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)


class RestoreServiceStateTests(unittest.TestCase):
    def check(self, api, portal, edge=True):
        with mock.patch.object(GUARD, 'unit_state', side_effect=[api, portal]), \
                mock.patch.object(GUARD, 'closed_edge', return_value=edge):
            return GUARD.require_closed_restore_services()

    def test_webhook_only_api_can_remain_running_during_closed_restore(self):
        self.assertEqual(self.check(
            {'UnitFileState=enabled', 'ActiveState=active'},
            {'UnitFileState=disabled', 'ActiveState=inactive'}), 'webhook_only')

    def test_offline_preparation_state_still_allowed(self):
        self.assertEqual(self.check(
            {'UnitFileState=disabled', 'ActiveState=inactive'},
            {'UnitFileState=disabled', 'ActiveState=inactive'}), 'fully_offline')

    def test_enabled_but_failed_api_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'service state'):
            self.check({'UnitFileState=enabled', 'ActiveState=inactive'},
                       {'UnitFileState=disabled', 'ActiveState=inactive'})

    def test_public_portal_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'service state'):
            self.check({'UnitFileState=enabled', 'ActiveState=active'},
                       {'UnitFileState=enabled', 'ActiveState=active'})

    def test_open_customer_edge_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'edge'):
            self.check({'UnitFileState=enabled', 'ActiveState=active'},
                       {'UnitFileState=disabled', 'ActiveState=inactive'}, edge=False)


if __name__ == '__main__':
    unittest.main()
