#!/usr/bin/env python3
"""Enable the reviewed pilot capacity policy and its project reconciler."""
import json
import os
import pathlib
import stat
import subprocess
import tempfile

POLICY = pathlib.Path('/etc/aichain/pilot-self-service-policy.json')
UNIT = 'orvessian-pilot-self-service.timer'


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    info = POLICY.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 8192:
        raise ValueError('Protected policy required')
    original = POLICY.read_text(encoding='utf-8')
    value = json.loads(original)
    if value.get('version') != 1 or value.get('maxProjects') != 5 or \
            value.get('enabled') is not False:
        raise ValueError('Unexpected self-service policy')
    value['enabled'] = True
    fd, temporary = tempfile.mkstemp(prefix='.self-service-policy-', dir=POLICY.parent)
    try:
        os.fchmod(fd, 0o600)
        os.fchown(fd, 0, 0)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, POLICY)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    subprocess.run(('systemctl', 'daemon-reload'), check=True, timeout=20)
    subprocess.run(('systemd-analyze', 'verify',
                    '/etc/systemd/system/orvessian-pilot-self-service.service',
                    '/etc/systemd/system/orvessian-pilot-self-service.timer'),
                   check=True, timeout=20)
    subprocess.run(('systemctl', 'start', 'orvessian-pilot-self-service.service'),
                   check=True, timeout=1300)
    subprocess.run(('systemctl', 'enable', '--now', UNIT), check=True, timeout=30)
    subprocess.run(('systemctl', 'is-enabled', '--quiet', UNIT), check=True,
                   timeout=10)
    subprocess.run(('systemctl', 'is-active', '--quiet', UNIT), check=True,
                   timeout=10)
    print('pilot_self_service=enabled;max_projects=5')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError, subprocess.SubprocessError):
        print('Pilot self-service enablement failed; inspect policy and unit state.')
        raise SystemExit(1) from None
