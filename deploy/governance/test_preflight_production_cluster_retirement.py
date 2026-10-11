#!/usr/bin/env python3
"""Pure read-only retirement gate cases; no database connection."""

import importlib.util
import pathlib
import unittest


SOURCE = pathlib.Path(__file__).with_name('preflight-production-cluster-retirement.py')
SPEC = importlib.util.spec_from_file_location('retirement_preflight', SOURCE)
PREFLIGHT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREFLIGHT)


class RetirementGateTests(unittest.TestCase):
    def setUp(self):
        self.backup = {
            'healthy': True, 'marker_valid': True,
            'latest_due_backup_covered': True,
            'last_completed_upload_utc': '2026-10-11T14:40:49+00:00',
        }
        self.hosted = {'healthy': True}
        self.recovery = {
            'healthy': True,
            'backupId': 'c79ba135-5b42-417e-b3bd-cd1955853f12',
            'restoredDatabase': 'gov_restore_b2_a451c6e5b6b2',
            'restoredDatabaseClosed': True,
            'registeredJournalRoles': 4,
        }
        self.inventory = {
            'databases': [{'name': name, 'connections': 0}
                          for name in PREFLIGHT.EXPECTED_DATABASES],
            'roles': [{'name': name} for name in PREFLIGHT.EXPECTED_ROLES],
        }

    def assess(self):
        return PREFLIGHT.assess(self.backup, self.hosted, self.inventory,
                                self.recovery)

    def test_exact_healthy_on_demand_backup_and_restore_pass(self):
        self.assertTrue(self.assess()['ready'])

    def test_earlier_backup_blocks(self):
        self.backup['last_completed_upload_utc'] = '2026-10-11T09:16:58+00:00'
        self.assertIn('on_demand_backup_checkpoint', self.assess()['blockers'])

    def test_unreviewed_restore_blocks(self):
        self.recovery['backupId'] = 'another-backup'
        self.assertIn('independent_closed_restore', self.assess()['blockers'])

    def test_unhealthy_local_pilot_blocks(self):
        self.hosted['healthy'] = False
        self.assertIn('local_pilot_health', self.assess()['blockers'])

    def test_changed_inventory_and_connection_block(self):
        self.inventory['databases'][0]['connections'] = 1
        self.inventory['roles'].append({'name': 'governance_prod_api'})
        blockers = self.assess()['blockers']
        self.assertIn('managed_database_has_connections', blockers)
        self.assertIn('managed_role_inventory_changed', blockers)


if __name__ == '__main__':
    unittest.main()
