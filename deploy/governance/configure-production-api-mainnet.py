#!/usr/bin/env python3
"""Bind the private Production API to the reviewed Base mainnet anchor."""

import argparse
import importlib.util
import json
import os
import pathlib
import re
import stat
import subprocess
import tempfile


HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE / 'replace-production-api-active.py'
SPEC = importlib.util.spec_from_file_location('active_production_api', SOURCE)
ACTIVE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ACTIVE)
ENV = pathlib.Path('/etc/orvessian-production-api.env')
RELEASE = pathlib.Path('/opt/aichain/orvessian-production-api/PRODUCTION-RELEASE.json')
RPC_CHECK = pathlib.Path('/opt/aichain/orvessian-production-worker/scripts/check-production-mainnet-rpc.cjs')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
UNIT = 'orvessian-production-api.service'
COMMIT = '44252f2a12f6f584ecf17af60caa6a29467d8158'
ANCHOR = {'chainId': 8453,
          'contract': '0xcF3A904b433c50E2d4F6E2a0d692E855d33910f2',
          'codeHash': '0x507e6fe47195ae115026837a14f7613537f29c11f0b798bda1abc0bda2eab10f'}
RPC = 'https://mainnet.base.org'
FIELDS = {
    'GOVERNANCE_EVIDENCE_ANCHOR_JSON': "'" + json.dumps(ANCHOR, separators=(',', ':')) + "'",
    'GOVERNANCE_EVIDENCE_RPC_URL': RPC,
}


def checked_environment():
    info = ENV.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or not 1 <= info.st_size <= 16384:
        raise ValueError('Protected Production API environment required')
    content = ENV.read_bytes()
    lines = content.decode('utf-8').splitlines()
    if not content.endswith(b'\n') or not lines or any(
            not re.fullmatch(r'[A-Z0-9_]+=[^\r\n]*', line) for line in lines):
        raise ValueError('Unexpected Production API environment format')
    values = dict(line.split('=', 1) for line in lines)
    if len(values) != len(lines) or any(
            key in values and values[key] != value for key, value in FIELDS.items()):
        raise ValueError('Existing mainnet setting differs from reviewed binding')
    return content, all(values.get(key) == value for key, value in FIELDS.items())


def verified_rpc():
    result = subprocess.run((NODE, str(RPC_CHECK)), capture_output=True,
                            text=True, timeout=30, check=False)
    if result.returncode:
        raise ValueError('Reviewed Base mainnet RPC check failed')
    value = json.loads(result.stdout)
    if value.get('healthy') is not True or value.get('chainId') != 8453 or \
            value.get('codeHash') != ANCHOR['codeHash']:
        raise ValueError('Base mainnet anchor check failed')


def preflight():
    if os.geteuid() != 0 or json.loads(RELEASE.read_text(
            encoding='utf-8')).get('sourceCommit') != COMMIT:
        raise ValueError('Reviewed active Production API release required')
    content, configured = checked_environment()
    ACTIVE.check_live()
    verified_rpc()
    return content, configured


def install(content):
    payload = content
    for key, value in FIELDS.items():
        if not any(line.startswith(key + '=') for line in content.decode('utf-8').splitlines()):
            payload += (key + '=' + value + '\n').encode('utf-8')
    replace_environment(payload)
    try:
        ACTIVE.command('systemctl', 'restart', UNIT, timeout=45)
        ACTIVE.wait_live()
    except BaseException:
        replace_environment(content)
        ACTIVE.command('systemctl', 'restart', UNIT, timeout=45)
        ACTIVE.wait_live()
        raise ValueError('Production API mainnet binding rolled back') from None
    print('production_api_mainnet=installed;rpc=public;edge=webhook_only')


def replace_environment(payload):
    descriptor, temporary = tempfile.mkstemp(prefix='.orvessian-prod-mainnet-',
                                              dir=ENV.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, ENV)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    content, configured = preflight()
    if configured:
        print('production_api_mainnet=installed;mode=read-only')
    elif args.apply:
        install(content)
    else:
        print('production_api_mainnet=ready;mode=read-only;rpc=public')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production API mainnet setup failed; private service unchanged or rolled back') from None
