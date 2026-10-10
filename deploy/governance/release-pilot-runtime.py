#!/usr/bin/env python3
"""Release the coupled hosted pilot API and evidence workers with rollback.

Both root-owned archives are staged and checked before any service stops. The
worker's node_modules link is recreated against the new API directory. A
failed restart or hosted-health check restores both prior directories.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tarfile
import time

BASE = pathlib.Path('/opt/aichain')
SETUP = BASE / 'governance-pilot-db-setup'
CURRENT = {'api': BASE / 'governance-pilot-api',
           'worker': BASE / 'governance-pilot-worker'}
RELEASES = BASE / 'governance-pilot-runtime-releases'
LOCK = BASE / '.governance-pilot-runtime-release.lock'
BACKUP_LOCK = pathlib.Path('/etc/aichain/pilot-backup/backup.lock')
API_UNIT = 'aichain-governance-synthetic-api.service'
PORTAL_UNIT = 'orvessian-pilot-portal.service'
HEALTH = SETUP / 'check-pilot-hosted-health.py'
MAX_ARCHIVE_BYTES = 2 * 1024 ** 3
MAX_MEMBERS = 100000
MAX_UNPACKED_BYTES = 4 * 1024 ** 3


def paths(release_id, component):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', release_id):
        raise ValueError('Invalid release ID')
    if component not in CURRENT:
        raise ValueError('Invalid component')
    return tuple(RELEASES / (release_id + '-' + component + suffix)
                 for suffix in ('.stage', '.previous', '.failed'))


def verify_archive(archive, digest):
    if not archive.is_absolute() or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Absolute archive and SHA-256 required')
    info = archive.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            not 1 <= info.st_size <= MAX_ARCHIVE_BYTES:
        raise ValueError('Root-owned archive within size limit required')
    checksum = hashlib.sha256()
    with archive.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    if checksum.hexdigest() != digest:
        raise ValueError('Archive SHA-256 mismatch')


def unpack(archive, stage, component):
    stage.mkdir(mode=0o755)
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        if len(members) > MAX_MEMBERS or \
                sum(member.size for member in members) > MAX_UNPACKED_BYTES:
            raise ValueError('Archive member limit exceeded')
        seen = set()
        for member in members:
            name = pathlib.PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or \
                    not (member.isdir() or member.isfile()):
                raise ValueError('Archive contains unsafe entry')
            if name.parts in ((), ('.',)):
                continue
            relative = name.as_posix().rstrip('/')
            if relative in seen:
                raise ValueError('Duplicate archive entry')
            seen.add(relative)
            target = stage.joinpath(*name.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o755)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                if target.exists() or target.is_symlink():
                    raise ValueError('Duplicate archive entry')
                reader = source.extractfile(member)
                if reader is None:
                    raise ValueError('Archive file unavailable')
                with reader, target.open('xb') as writer:
                    shutil.copyfileobj(reader, writer)
                target.chmod(0o644)
    required = ('scripts', 'services/governance', 'sdk/typescript')
    if any(not (stage / item).is_dir() for item in required):
        raise ValueError('Runtime source archive incomplete')
    if component == 'api':
        if not (stage / 'scripts/governance-hosted-synthetic-api.cjs').is_file() or \
                any(not (stage / 'node_modules' / name).is_dir()
                    for name in ('pg', 'ethers', 'jose')):
            raise ValueError('API archive lacks entrypoint or dependencies')
    else:
        if not (stage / 'scripts/governance-worker.cjs').is_file() or \
                not (stage / 'scripts/governance-worker-recover-lock.cjs').is_file() or \
                (stage / 'node_modules').exists():
            raise ValueError('Worker archive incomplete or contains node_modules')
        link_worker_dependencies(stage)


def link_worker_dependencies(stage):
    (stage / 'node_modules').symlink_to(CURRENT['api'] / 'node_modules',
                                       target_is_directory=True)


def active_units(workers):
    units = [PORTAL_UNIT, API_UNIT, *(w['unit'] for w in workers)]
    if any(subprocess.run(('systemctl', 'is-active', '--quiet', unit),
                          check=False).returncode != 0 for unit in units):
        raise ValueError('Every registered service must be active before release')
    return units


def stop_units(units):
    stopped = []
    try:
        for unit in units:
            subprocess.run(('systemctl', 'stop', unit), check=True, timeout=75)
            stopped.append(unit)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        start_units(stopped)
        raise
    return stopped


def start_units(units):
    for unit in reversed(units):
        subprocess.run(('systemctl', 'start', unit), check=True, timeout=75)


def check_health():
    for _ in range(15):
        try:
            result = subprocess.run(('python3', str(HEALTH)), check=True,
                                    capture_output=True, text=True, timeout=30)
            if json.loads(result.stdout).get('healthy') is True:
                return True
        except (OSError, ValueError, subprocess.CalledProcessError,
                subprocess.TimeoutExpired):
            pass
        time.sleep(2)
    return False


def swap_in(stages, previous):
    moved = []
    try:
        for component in ('api', 'worker'):
            CURRENT[component].rename(previous[component])
            moved.append((component, 'previous'))
            stages[component].rename(CURRENT[component])
            moved.append((component, 'current'))
    except OSError:
        for component, kind in reversed(moved):
            if kind == 'current':
                CURRENT[component].rename(stages[component])
            else:
                previous[component].rename(CURRENT[component])
        raise


def restore_previous(previous, failed):
    moves = []
    try:
        for component in ('worker', 'api'):
            CURRENT[component].rename(failed[component])
            moves.append((CURRENT[component], failed[component]))
            previous[component].rename(CURRENT[component])
            moves.append((previous[component], CURRENT[component]))
    except OSError:
        for source, destination in reversed(moves):
            destination.rename(source)
        raise


def activate(archives, hashes, release_id, workers):
    entries = {name: paths(release_id, name) for name in CURRENT}
    if any(not current.is_dir() for current in CURRENT.values()) or \
            any(path.exists() for triplet in entries.values() for path in triplet):
        raise ValueError('Current directories and unused release ID required')
    for component in CURRENT:
        verify_archive(archives[component], hashes[component])
    stages = {name: entries[name][0] for name in CURRENT}
    previous = {name: entries[name][1] for name in CURRENT}
    failed = {name: entries[name][2] for name in CURRENT}
    try:
        for component in CURRENT:
            unpack(archives[component], stages[component], component)
        units = active_units(workers)
        stopped = stop_units(units)
        try:
            swap_in(stages, previous)
            try:
                start_units(stopped)
                if not check_health():
                    raise RuntimeError('Runtime health check failed')
            except (OSError, RuntimeError, subprocess.CalledProcessError,
                    subprocess.TimeoutExpired):
                for unit in stopped:
                    subprocess.run(('systemctl', 'stop', unit), check=False,
                                   timeout=75)
                restore_previous(previous, failed)
                start_units(stopped)
                if not check_health():
                    raise RuntimeError('Runtime rollback failed health check')
                raise RuntimeError('Runtime activation failed; prior build restored')
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            if all(path.exists() for path in previous.values()):
                restore_previous(previous, failed)
            start_units(stopped)
            raise
    finally:
        for stage in stages.values():
            if stage.exists():
                shutil.rmtree(stage)
    print('pilot_runtime_release=active;release_id=' + release_id)


def rollback(release_id, workers):
    entries = {name: paths(release_id, name) for name in CURRENT}
    if any(not CURRENT[name].is_dir() or not entries[name][1].is_dir() or
           entries[name][0].exists() or entries[name][2].exists()
           for name in CURRENT):
        raise ValueError('Active release and both previous builds required')
    units = active_units(workers)
    stopped = stop_units(units)
    previous = {name: entries[name][1] for name in CURRENT}
    failed = {name: entries[name][2] for name in CURRENT}
    try:
        restore_previous(previous, failed)
        start_units(stopped)
        if not check_health():
            raise RuntimeError('Previous build failed health check')
    except (OSError, RuntimeError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired):
        for unit in stopped:
            subprocess.run(('systemctl', 'stop', unit), check=False, timeout=75)
        for name in ('worker', 'api'):
            if failed[name].exists():
                CURRENT[name].rename(previous[name])
                failed[name].rename(CURRENT[name])
        start_units(stopped)
        check_health()
        raise
    print('pilot_runtime_release=rolled_back;release_id=' + release_id)


def main():
    import fcntl
    from pilot_worker_registry import LOCK as WORKER_LOCK, load_registry
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    deploy = sub.add_parser('activate')
    for name in CURRENT:
        deploy.add_argument('--' + name + '-archive', type=pathlib.Path,
                            required=True)
        deploy.add_argument('--' + name + '-sha256', required=True)
    deploy.add_argument('--release-id', required=True)
    undo = sub.add_parser('rollback')
    undo.add_argument('--release-id', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Root required')
    RELEASES.mkdir(mode=0o755, exist_ok=True)
    # Use the same order as the backup runner, then prevent project provisioning.
    with LOCK.open('a') as release_lock, BACKUP_LOCK.open('a') as backup_lock, \
            WORKER_LOCK.open('a') as registry_lock:
        for handle in (release_lock, backup_lock, registry_lock):
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        workers = load_registry()
        if any(worker['state'] != 'active' for worker in workers):
            raise ValueError('Inactive registered worker requires review')
        if args.command == 'activate':
            activate({name: getattr(args, name + '_archive') for name in CURRENT},
                     {name: getattr(args, name + '_sha256') for name in CURRENT},
                     args.release_id, workers)
        else:
            rollback(args.release_id, workers)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, tarfile.TarError,
            subprocess.CalledProcessError, subprocess.TimeoutExpired,
            BlockingIOError) as error:
        print('pilot_runtime_release=failed;reason=' + type(error).__name__)
        raise SystemExit(1) from None
