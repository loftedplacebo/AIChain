#!/usr/bin/env python3
"""Stage the first pinned Production worker runtime and inactive unit template."""

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

from production_worker_registry import load_registry


RELEASE = pathlib.Path('/opt/aichain/orvessian-production-worker')
SOURCE_UNIT = pathlib.Path('/opt/aichain/governance-pilot-db-setup/orvessian-production-project-worker@.service')
UNIT = pathlib.Path('/etc/systemd/system/orvessian-production-project-worker@.service')
UNIT_SHA256 = 'b55aff6ce94a7f652f719f60afe6695282e70af9d900b8afbe2f053714b5e889'
SOURCE_COMMIT = '76a89ae1b6ffca41c8a0b0ed6d9a834a67e19371'
ARCHIVE_SHA256 = '11deabf3d1604edf6c18c6523b951ec9102b954848f4e7261e630d99883792c5'
REQUIRED = {
    'scripts/governance-production-worker.cjs',
    'scripts/governance-worker-recover-lock.cjs',
    'services/governance/worker.cjs',
    'services/governance/worker-launch-binding.cjs',
    'node_modules/pg/package.json',
    'node_modules/ethers/package.json',
}
ROOTS = {'scripts', 'services', 'sdk', 'node_modules'}


def protected_file(path, maximum):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022 or not 1 <= info.st_size <= maximum:
        raise ValueError('Protected Production worker release input required')
    return path


def inspect_archive(archive, digest):
    if not archive.is_absolute() or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Absolute Production archive and exact SHA-256 required')
    if hashlib.sha256(protected_file(archive, 200_000_000).read_bytes()).hexdigest() != digest:
        raise ValueError('Production worker archive hash mismatch')
    names = set()
    total = 0
    with tarfile.open(archive, 'r:gz') as package:
        for item in package:
            name = pathlib.PurePosixPath(item.name)
            if not item.isfile() or name.is_absolute() or len(name.parts) < 2 or \
                    name.parts[0] not in ROOTS or '..' in name.parts or \
                    name.suffix.lower() in ('.env', '.pem', '.key') or \
                    item.name in names or item.size < 0 or item.size > 20_000_000:
                raise ValueError('Unexpected Production worker archive member')
            names.add(item.name)
            total += item.size
            if len(names) > 100_000 or total > 500_000_000:
                raise ValueError('Production worker archive exceeds limits')
    if not REQUIRED.issubset(names):
        raise ValueError('Production worker entrypoint or dependencies missing')
    return len(names)


def preflight(archive, digest):
    if os.geteuid() != 0 or UNIT.exists() or UNIT.is_symlink():
        raise ValueError('Root and a new inactive Production worker unit required')
    if hashlib.sha256(protected_file(SOURCE_UNIT, 8192).read_bytes()).hexdigest() != UNIT_SHA256:
        raise ValueError('Reviewed Production worker unit hash mismatch')
    if RELEASE.exists() or RELEASE.is_symlink():
        info = RELEASE.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or \
                info.st_mode & 0o022 or any(RELEASE.iterdir()):
            raise ValueError('Empty root-owned Production worker release required')
    _, workers = load_registry()
    if workers:
        raise ValueError('Production worker inventory must be empty for initial staging')
    return inspect_archive(archive, digest)


def stage(archive, digest, commit):
    temporary = RELEASE.with_name(RELEASE.name + '.stage-' + commit[:12])
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('Prior Production worker staging path needs review')
    temporary.mkdir(mode=0o755)
    try:
        with tarfile.open(archive, 'r:gz') as package:
            for item in package:
                target = temporary.joinpath(*pathlib.PurePosixPath(item.name).parts)
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with package.extractfile(item) as reader, target.open('xb') as writer:
                    shutil.copyfileobj(reader, writer)
                target.chmod(0o644)
        manifest = temporary / 'PRODUCTION-WORKER-RELEASE.json'
        manifest.write_text(json.dumps({
            'sourceCommit': commit, 'archiveSha256': digest,
            'serviceTemplate': UNIT.name, 'activation': 'disabled',
        }, sort_keys=True) + '\n', encoding='ascii')
        manifest.chmod(0o644)
        if RELEASE.exists():
            RELEASE.rmdir()
        temporary.rename(RELEASE)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    UNIT.write_bytes(SOURCE_UNIT.read_bytes())
    UNIT.chmod(0o644)
    subprocess.run(('systemctl', 'daemon-reload'), check=True, timeout=15)
    subprocess.run(('systemd-analyze', 'verify', str(UNIT)),
                   check=True, timeout=15, capture_output=True)
    result = subprocess.run(('systemctl', 'is-enabled', UNIT.name),
                            capture_output=True, text=True, timeout=15,
                            check=False)
    if result.stdout.strip() != 'disabled':
        raise ValueError('Production worker template must remain disabled')
    print('production_worker_release=staged;commit=' + commit[:12] +
          ';service=inactive;wallet=unbound')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=pathlib.Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.commit != SOURCE_COMMIT or args.sha256 != ARCHIVE_SHA256:
        raise ValueError('Pinned Production worker source and archive required')
    count = preflight(args.archive, args.sha256)
    if args.apply:
        stage(args.archive, args.sha256, args.commit)
    else:
        print(json.dumps({'productionWorkerRelease': 'ready',
                          'archiveMembers': count, 'mode': 'read-only',
                          'service': 'absent'}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, tarfile.TarError,
            subprocess.TimeoutExpired, subprocess.CalledProcessError):
        raise SystemExit('Production worker release staging failed; '
                         'no wallet or service activated') from None
