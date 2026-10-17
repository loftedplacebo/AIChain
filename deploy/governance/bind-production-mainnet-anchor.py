#!/usr/bin/env python3
"""Bind the independently verified Base mainnet anchor to an empty registry."""

import fcntl
import json
import os
import stat
import subprocess
import sys

from production_worker_registry import LOCK, REGISTRY, load_registry, validate_registry


NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
VERIFIER = '/opt/aichain/orvessian-mainnet-deploy/scripts/verify-base-mainnet-deployment.cjs'
RPC = 'https://mainnet.base.org'
TRANSACTION = '0xa32ab8f5a704ecf300b3b4a1de943952f33d1efd6dceed201a16b98191e27626'
CHAIN = {
    'chainId': 8453,
    'contract': '0xcF3A904b433c50E2d4F6E2a0d692E855d33910f2',
    'codeHash': '0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f',
}


def verified_contract():
    result = subprocess.run(
        (NODE, VERIFIER, CHAIN['contract'], TRANSACTION),
        cwd='/opt/aichain/orvessian-mainnet-deploy',
        env={**os.environ, 'GOVERNANCE_MAINNET_RPC_URL': RPC},
        capture_output=True, text=True, timeout=30, check=True,
    )
    evidence = json.loads(result.stdout)
    if evidence.get('status') != 'verified' or \
            evidence.get('chainId') != 8453 or \
            evidence.get('contract', '').lower() != CHAIN['contract'].lower() or \
            evidence.get('codeHash', '').lower() != CHAIN['codeHash'].lower() or \
            evidence.get('deploymentTransaction', '').lower() != TRANSACTION or \
            evidence.get('confirmations', 0) < 12:
        raise ValueError('Independently verified Base mainnet deployment required')
    return evidence['confirmations']


def next_registry(document):
    validate_registry(document)
    if document['workers']:
        raise ValueError('Production workers require a separate change review')
    if document['chain'] == CHAIN:
        return None
    if document['chain'] is not None:
        raise ValueError('Existing Production chain binding differs')
    candidate = {**document, 'chain': CHAIN}
    validate_registry(candidate)
    return candidate


def protected_lock():
    parent = REGISTRY.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or \
            stat.S_IMODE(parent.st_mode) != 0o700:
        raise ValueError('Protected Production configuration directory required')
    fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600:
        os.close(fd)
        raise ValueError('Protected Production registry lock required')
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise
    return fd


def install(document):
    temporary = REGISTRY.parent / ('.workers-anchor-' + str(os.getpid()) + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(document, handle, sort_keys=True)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, REGISTRY)
        parent_fd = os.open(REGISTRY.parent, os.O_RDONLY | os.O_DIRECTORY |
                            os.O_NOFOLLOW)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    if os.geteuid() != 0 or sys.argv[1:] not in ([], ['--apply']):
        raise ValueError('Root required; use --apply to bind')
    confirmations = verified_contract()
    if not sys.argv[1:]:
        document, _ = load_registry()
        candidate = next_registry(document)
        print('production_mainnet_anchor=' + ('ready' if candidate else 'already_bound') +
              ';workers=0;confirmations=' + str(confirmations))
        return
    lock = protected_lock()
    try:
        document, _ = load_registry()
        candidate = next_registry(document)
        if candidate:
            install(candidate)
        updated, workers = load_registry()
        if updated['chain'] != CHAIN or workers:
            raise ValueError('Production chain binding review failed')
    finally:
        os.close(lock)
    print('production_mainnet_anchor=' + ('bound' if candidate else 'already_bound') +
          ';workers=0;confirmations=' + str(confirmations))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.SubprocessError):
        raise SystemExit('Production mainnet anchor binding failed; '
                         'no worker or customer route activated') from None
