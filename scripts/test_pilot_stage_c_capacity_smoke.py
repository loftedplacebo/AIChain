"""State scope and replay invariants for the bounded pilot workload."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).with_name('pilot_stage_c_capacity_smoke.py')
spec = importlib.util.spec_from_file_location('pilot_stage_c_capacity_smoke', SOURCE)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class CapacityStateTest(unittest.TestCase):
    def test_pending_replay_keeps_identity_and_rejects_scope_change(self):
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / 'run.json'
            state = runner.load(state_path, 'trial-a', 10, 360, 'org-a', 'prj-a')
            state['pendingAt'] = '2026-10-06T20:00:00.000Z'
            runner.save(state_path, state)
            resumed = runner.load(state_path, 'trial-a', 10, 360, 'org-a', 'prj-a')
            self.assertEqual(resumed['accepted'], 0)
            self.assertEqual(resumed['pendingAt'], state['pendingAt'])
            for changed in [
                ('trial-b', 10, 360, 'org-a', 'prj-a'),
                ('trial-a', 9, 360, 'org-a', 'prj-a'),
                ('trial-a', 10, 60, 'org-a', 'prj-a'),
                ('trial-a', 10, 360, 'org-b', 'prj-a'),
                ('trial-a', 10, 360, 'org-a', 'prj-b'),
            ]:
                with self.assertRaises(ValueError):
                    runner.load(state_path, *changed)


if __name__ == '__main__':
    unittest.main()
