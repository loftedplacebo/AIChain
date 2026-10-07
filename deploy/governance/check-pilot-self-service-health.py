#!/usr/bin/env python3
"""Read-only coverage and funding health for open pilot provisioning."""
import json
import os
import subprocess

RECONCILE = '/opt/aichain/governance-pilot-db-setup/reconcile-pilot-self-service.py'
FUND = '/opt/aichain/governance-pilot-db-setup/fund-pilot-project-relayer.cjs'
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
TIMER = 'orvessian-pilot-self-service.timer'
SERVICE = 'orvessian-pilot-self-service.service'


def command(args, timeout=35):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                          check=False)


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    plan = command(('python3', RECONCILE, '--check-only'))
    lines = [line for line in plan.stdout.splitlines() if line.startswith('{')]
    state = json.loads(lines[-1]) if plan.returncode == 0 and len(lines) == 1 else {}
    funding = command((NODE, FUND, '--check'))
    lines = [line for line in funding.stdout.splitlines() if line.startswith('{')]
    wallet = json.loads(lines[-1]) if funding.returncode == 0 and len(lines) == 1 else {}
    timer_enabled = command(('systemctl', 'is-enabled', '--quiet', TIMER)).returncode == 0
    timer_active = command(('systemctl', 'is-active', '--quiet', TIMER)).returncode == 0
    service_failed = command(('systemctl', 'is-failed', '--quiet', SERVICE)).returncode == 0
    pending = state.get('pending')
    projects = state.get('projects')
    cap = state.get('maxProjects')
    balance = int(wallet['balanceWei']) if str(wallet.get('balanceWei', '')).isdigit() else 0
    # One full target and a bounded gas margin must remain for the next project.
    funding_ready = balance >= 1050000000000000 or projects == cap
    healthy = (state.get('healthy') is True and state.get('enabled') is True
               and pending == 0 and timer_enabled and timer_active
               and not service_failed and funding_ready)
    print(json.dumps({'healthy': healthy, 'projects': projects,
                      'maxProjects': cap, 'pending': pending,
                      'timerEnabled': timer_enabled, 'timerActive': timer_active,
                      'serviceFailed': service_failed, 'fundingReady': funding_ready,
                      'fundingBalanceWei': str(balance)}, sort_keys=True))
    if not healthy:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired,
            json.JSONDecodeError):
        print('{"healthy":false,"reason":"self_service_check_failed"}')
        raise SystemExit(1) from None
