#!/usr/bin/env python3
"""Read-only combined hosted pilot health for the owner's alert automation."""

import json
import os
import subprocess

RUNTIME = ('python3', '/opt/aichain/governance-pilot-db-setup/check-pilot-runtime-health.py')
APP_DATA = ('systemd-run', '--quiet', '--wait', '--collect', '--pipe',
            '-p', 'WorkingDirectory=/opt/aichain/governance-pilot-api',
            '-p', 'EnvironmentFile=/etc/aichain-governance-synthetic-api.env',
            '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node',
            'scripts/check-pilot-app-data.cjs')


def check(command: tuple[str, ...]) -> dict:
    result = subprocess.run(command, capture_output=True, text=True,
                            timeout=40, check=False)
    lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
    if not lines:
        return {'healthy': False, 'reason': 'check_unavailable', 'exitCode': result.returncode}
    try:
        data = json.loads(lines[-1])
    except json.JSONDecodeError:
        return {'healthy': False, 'reason': 'check_invalid_json', 'exitCode': result.returncode}
    if not isinstance(data, dict) or data.get('healthy') is not True or result.returncode != 0:
        return {**data, 'healthy': False, 'exitCode': result.returncode}
    return data


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    runtime = check(RUNTIME)
    app_data = check(APP_DATA)
    healthy = runtime.get('healthy') is True and app_data.get('healthy') is True
    print(json.dumps({'healthy': healthy, 'runtime': runtime, 'appData': app_data},
                     sort_keys=True))
    if not healthy:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"combined_check_failed"}')
        raise SystemExit(1) from None
