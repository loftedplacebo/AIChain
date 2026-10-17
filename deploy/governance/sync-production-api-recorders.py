#!/usr/bin/env python3
"""Copy public per-project recorder bindings into the private Production API."""

import argparse
import importlib.util
import json
import os
import pathlib
import re
import stat
import tempfile
import time

from production_worker_registry import load_registry


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'active_production_api', HERE / 'replace-production-api-active.py')
ACTIVE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ACTIVE)
ENV = pathlib.Path('/etc/orvessian-production-api.env')
RELEASE = pathlib.Path('/opt/aichain/orvessian-production-api')
UNIT = 'orvessian-production-api.service'
FIELD = 'GOVERNANCE_PRODUCTION_RECORDER_MAP'


def live():
    if ACTIVE.unit_state() != {'UnitFileState=enabled', 'ActiveState=active'}:
        raise ValueError('Active Production API required')
    ACTIVE.healthy(ACTIVE.PRIVATE)
    ACTIVE.healthy(ACTIVE.PILOT)
    ACTIVE.public_edge()


def wait_live():
    for attempt in range(8):
        try:
            live()
            return
        except (OSError, ValueError, json.JSONDecodeError):
            if attempt == 7:
                raise
            time.sleep(1)


def protected_environment():
    info = ENV.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or not 1 <= info.st_size <= 16384:
        raise ValueError('Protected Production API environment required')
    content = ENV.read_bytes()
    lines = content.decode('utf-8').splitlines()
    if not content.endswith(b'\n') or not lines or any(
            not re.fullmatch(r'[A-Z0-9_]+=[^\r\n]*', line) for line in lines):
        raise ValueError('Unexpected Production API environment format')
    keys = [line.split('=', 1)[0] for line in lines]
    if len(keys) != len(set(keys)):
        raise ValueError('Duplicate Production API environment field')
    return content, dict(line.split('=', 1) for line in lines)


def binding_rows(workers):
    if len(workers) > 10:
        raise ValueError('First Production cohort is limited to ten projects')
    return sorted(({'tenant': worker['tenant'], 'project': worker['project'],
                    'recorder': worker['recorder'].lower()} for worker in workers),
                  key=lambda item: (item['tenant'], item['project']))


def preflight(commit):
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Root and exact reviewed release required')
    manifest = json.loads((RELEASE / 'PRODUCTION-RELEASE.json').read_text(
        encoding='utf-8'))
    if manifest.get('sourceCommit') != commit or \
            not (RELEASE / 'services/governance/production-recorder-map.cjs').is_file():
        raise ValueError('Production API recorder-scoping release required')
    document, workers = load_registry()
    if document['chain'] is None:
        raise ValueError('Reviewed Production chain binding required')
    desired = binding_rows(workers)
    content, fields = protected_environment()
    current = fields.get(FIELD)
    if current is not None:
        if not current.startswith("'[") or not current.endswith("]'"):
            raise ValueError('Existing Production recorder map format differs')
        previous = json.loads(current[1:-1])
        if not isinstance(previous, list) or any(
                row not in desired for row in previous):
            raise ValueError('Production recorder mapping changed or was removed')
    live()
    return content, current, desired


def replace_environment(content):
    descriptor, temporary = tempfile.mkstemp(prefix='.orvessian-prod-recorders-',
                                              dir=ENV.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, ENV)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install(content, current, desired):
    value = "'" + json.dumps(desired, separators=(',', ':')) + "'"
    lines = content.decode('utf-8').splitlines()
    if current is None:
        lines.append(FIELD + '=' + value)
    else:
        lines = [FIELD + '=' + value if line.startswith(FIELD + '=') else line
                 for line in lines]
    replace_environment(('\n'.join(lines) + '\n').encode('utf-8'))
    try:
        ACTIVE.command('systemctl', 'restart', UNIT, timeout=45)
        wait_live()
    except BaseException:
        replace_environment(content)
        ACTIVE.command('systemctl', 'restart', UNIT, timeout=45)
        wait_live()
        raise ValueError('Production recorder sync rolled back') from None
    print('production_api_recorders=installed;projects=' + str(len(desired)) +
          ';edge=webhook_only')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-commit', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    content, current, desired = preflight(args.release_commit)
    value = "'" + json.dumps(desired, separators=(',', ':')) + "'"
    if current == value:
        print('production_api_recorders=current;projects=' + str(len(desired)))
    elif args.apply:
        install(content, current, desired)
    else:
        print('production_api_recorders=ready;mode=read-only;projects=' +
              str(len(desired)))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise SystemExit('Production API recorder sync failed; service unchanged or rolled back') from None
