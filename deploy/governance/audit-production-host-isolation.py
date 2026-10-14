#!/usr/bin/env python3
"""Read-only Unix credential and service-boundary check for the shared VPS."""

import json
import os
import pathlib
import pwd
import stat
import subprocess


UNITS = {
    'production_api': ('orvessian-production-api.service',
                       'orvessian-prod-api', 'active'),
    'production_portal': ('orvessian-production-portal.service',
                          'orvessian-prod-portal', 'inactive'),
    'pilot_api': ('aichain-governance-synthetic-api.service',
                  'aichain-governance-api', 'active'),
    'pilot_portal': ('orvessian-pilot-portal.service',
                     'orvessian-pilot-portal', 'active'),
}
SECRETS = {
    'production_api': pathlib.Path('/etc/orvessian-production-api.env'),
    'production_workos': pathlib.Path('/etc/aichain/production/workos.env'),
    'production_archive': pathlib.Path('/etc/aichain/production/backup/backup.key'),
    'pilot_api': pathlib.Path('/etc/aichain-governance-synthetic-api.env'),
    'pilot_archive': pathlib.Path('/etc/aichain/pilot-backup/backup.key'),
}
DENIALS = {
    'production_api': ('pilot_api', 'pilot_archive'),
    'production_portal': ('production_api', 'production_workos',
                          'pilot_api', 'pilot_archive'),
    'pilot_api': ('production_api', 'production_workos', 'production_archive'),
    'pilot_portal': ('production_api', 'production_workos',
                     'production_archive'),
}


def unit_state(name):
    result = subprocess.run(('systemctl', 'show', name, '-p', 'User',
                             '-p', 'ActiveState', '-p', 'UnitFileState'),
                            capture_output=True, text=True, timeout=15,
                            check=False)
    if result.returncode:
        raise ValueError('Service state unavailable')
    return dict(line.split('=', 1) for line in result.stdout.splitlines()
                if '=' in line)


def private_root_file(path):
    info = path.lstat()
    return (stat.S_ISREG(info.st_mode) and info.st_uid == 0 and
            stat.S_IMODE(info.st_mode) == 0o600)


def denied(user, path):
    pwd.getpwnam(user)
    result = subprocess.run(('runuser', '-u', user, '--', 'test', '-r', str(path)),
                            capture_output=True, text=True, timeout=15,
                            check=False)
    if result.returncode not in (0, 1):
        raise ValueError('Credential access probe unavailable')
    return result.returncode == 1


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    services = {}
    for role, (unit, user, active) in UNITS.items():
        state = unit_state(unit)
        services[role] = (state.get('User') == user and
                          state.get('ActiveState') == active and
                          state.get('UnitFileState') ==
                          ('enabled' if active == 'active' else 'disabled'))
    files = {name: private_root_file(path) for name, path in SECRETS.items()}
    access_denied = {
        role: all(denied(UNITS[role][1], SECRETS[name]) for name in names)
        for role, names in DENIALS.items()
    }
    healthy = all(services.values()) and all(files.values()) and \
        all(access_denied.values())
    print(json.dumps({'healthy': healthy, 'services': services,
                      'protected_files': files,
                      'cross_environment_access_denied': access_denied},
                     sort_keys=True))
    if not healthy:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"host_isolation_check_failed"}')
        raise SystemExit(1) from None
