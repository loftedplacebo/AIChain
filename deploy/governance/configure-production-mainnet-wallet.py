#!/usr/bin/env python3
"""Install the owner-provided Base mainnet publisher key without echoing it.

This prepares custody only. It never funds, deploys, signs or starts a worker.
"""

import getpass
import json
import os
import pathlib
import re
import stat
import subprocess


ROOT = pathlib.Path('/etc/aichain/production')
KEY = ROOT / 'mainnet-publisher.key'
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
ETHERS = '/opt/aichain/orvessian-production-api/node_modules/ethers'
ADDRESS_SCRIPT = (
    "const {Wallet}=require(process.argv[1]);let key='';"
    "process.stdin.setEncoding('utf8');"
    "process.stdin.on('data',part=>key+=part);"
    "process.stdin.on('end',()=>{try{"
    "if(!/^0x[0-9a-fA-F]{64}\\n$/.test(key))throw Error('key');"
    "console.log(JSON.stringify({address:new Wallet(key.trim()).address}));"
    "}catch{process.exitCode=1}});"
)


def address_for(secret):
    result = subprocess.run((NODE, '-e', ADDRESS_SCRIPT, ETHERS),
                            input=secret + '\n', capture_output=True,
                            text=True, timeout=10, check=False)
    if result.returncode or result.stderr or not re.fullmatch(
            r'\{"address":"0x[0-9a-fA-F]{40}"\}\n', result.stdout):
        raise ValueError('Valid Base mainnet wallet key required')
    return json.loads(result.stdout)['address']


def normalize_key(value):
    secret = value.strip()
    if secret.startswith('0x'):
        secret = secret[2:]
    if not re.fullmatch(r'[0-9a-fA-F]{64}', secret):
        raise ValueError('wallet_key_format')
    return '0x' + secret


def protected_key():
    info = KEY.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 67:
        raise ValueError('Protected Production wallet file required')
    secret = KEY.read_text(encoding='ascii').rstrip('\n')
    if not re.fullmatch(r'0x[0-9a-fA-F]{64}', secret):
        raise ValueError('Protected Production wallet key malformed')
    return secret


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    info = ROOT.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('Protected Production configuration directory required')
    if KEY.exists() or KEY.is_symlink():
        address = address_for(protected_key())
        print('production_mainnet_wallet=already_installed;address=' + address +
              ';service=off')
        return
    secret = normalize_key(getpass.getpass(
        'Base mainnet wallet private key (64 hex characters, 0x optional): '))
    address = address_for(secret)
    fd = os.open(KEY, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='ascii') as handle:
            handle.write(secret + '\n')
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        KEY.unlink(missing_ok=True)
        raise
    if address_for(protected_key()) != address:
        raise ValueError('Production wallet verification failed')
    print('production_mainnet_wallet=installed;address=' + address + ';service=off')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        if str(error) == 'wallet_key_format':
            raise SystemExit('Production mainnet wallet installation failed: '
                             'key must be 64 hexadecimal characters; '
                             '0x prefix is optional. No key was printed.') from None
        raise SystemExit('Production mainnet wallet installation failed; '
                         'no key printed and no service activated') from None
    except (OSError, TypeError, subprocess.TimeoutExpired):
        raise SystemExit('Production mainnet wallet installation failed; '
                         'no key printed and no service activated') from None
