"""Offline ten-partner capacity checks; no VPS or wallet access."""
import importlib.util
import pathlib
import unittest


HERE = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    'pilot_cohort_capacity', HERE / 'pilot-cohort-capacity.py')
CAPACITY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAPACITY)


def inputs(projects=4, cap=14, balance=10_500_000_000_000_000):
    catalog = {'healthy': True, 'projects': projects, 'workers': projects,
               'missingProjects': [], 'staleWorkers': []}
    service = {'healthy': True, 'projects': projects, 'maxProjects': cap,
               'fundingBalanceWei': str(balance),
               'timerActive': True, 'timerEnabled': True,
               'serviceFailed': False, 'pending': 0,
               'capacity': {'used': projects, 'maxProjects': cap,
                            'triggerEnabled': True}}
    backup = {'healthy': True, 'marker_valid': True,
              'latest_due_backup_covered': True}
    return catalog, service, backup


class CohortCapacityTests(unittest.TestCase):
    def test_four_retained_projects_require_ten_more_slots_and_funding(self):
        result = CAPACITY.assess(*inputs())
        self.assertTrue(result['structuralReady'])
        self.assertFalse(result['throughputMeasured'])
        self.assertEqual(result['requiredTotalProjects'], 14)
        self.assertEqual(result['additionalSlotsNeeded'], 10)
        self.assertEqual(result['minimumFundingForRemainingSlotsWei'],
                         '10500000000000000')

    def test_current_cap_and_funding_fail_separately(self):
        result = CAPACITY.assess(*inputs(cap=5, balance=0))
        self.assertEqual(result['blockers'],
                         ['project_cap', 'funding_for_remaining_slots'])

    def test_missing_worker_and_stale_backup_block_expansion(self):
        catalog, service, backup = inputs()
        catalog['workers'] = 3
        catalog['missingProjects'] = [{'tenant': 'org-test', 'project': 'prj-test'}]
        backup['marker_valid'] = False
        result = CAPACITY.assess(catalog, service, backup)
        self.assertIn('project_worker_inventory', result['blockers'])
        self.assertIn('backup_coverage', result['blockers'])

    def test_disabled_reconciler_and_counter_mismatch_block_expansion(self):
        catalog, service, backup = inputs()
        service['timerActive'] = False
        service['capacity']['used'] = 3
        result = CAPACITY.assess(catalog, service, backup)
        self.assertIn('self_service_provisioning', result['blockers'])
        self.assertIn('database_capacity_boundary', result['blockers'])

    def test_invalid_numbers_fail_closed(self):
        catalog, service, backup = inputs()
        service['fundingBalanceWei'] = 'unknown'
        with self.assertRaises(ValueError):
            CAPACITY.assess(catalog, service, backup)


if __name__ == '__main__':
    unittest.main()
