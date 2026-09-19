#!/usr/bin/env python3
"""CPU-only regression: a transient IPC failure must not exit the GPU supervisor."""
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest


@unittest.skipUnless(os.name == 'posix', 'Requires bash/POSIX process signals')
class SupervisorRestartTest(unittest.TestCase):
    def test_transient_ipc_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            geth = root/'geth'
            geth.write_text('''#!/usr/bin/env bash
set -eu
count=0
[[ ! -f "$TEST_COUNTER" ]] || count=$(<"$TEST_COUNTER")
count=$((count+1))
printf '%s' "$count" > "$TEST_COUNTER"
if (( count == 2 )); then exit 1; fi
if (( count == 1 )); then echo 1; else echo 2; fi
''')
            miner = root/'miner'
            miner.write_text('#!/usr/bin/env bash\nexec sleep 60\n')
            for executable in [geth, miner]: executable.chmod(0o755)
            environment = dict(os.environ, TEST_COUNTER=str(root/'counter'), AICHAIN_MAX_GPU_TEMP_C='0')
            command = ['bash', str(Path(__file__).with_name('supervise-kawpow-g3-miner.sh')), str(miner), str(geth), str(root/'geth.ipc'), str(root/'evidence')]
            with (root/'output').open('w') as log:
                process = subprocess.Popen(command, env=environment, stdout=log, stderr=log)
                try:
                    deadline=time.monotonic()+12
                    events=root/'evidence/gpu-miner-supervisor-events.jsonl'
                    while time.monotonic()<deadline:
                        self.assertIsNone(process.poll(), 'Supervisor exited on temporary IPC failure')
                        if events.exists() and 'height-advanced' in events.read_text(): break
                        time.sleep(0.1)
                    else: self.fail('Supervisor did not recover height polling')
                    self.assertGreaterEqual(int((root/'counter').read_text()),3)
                finally:
                    process.terminate()
                    process.wait(timeout=10)


if __name__ == '__main__': unittest.main()
