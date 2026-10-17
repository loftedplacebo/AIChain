#!/usr/bin/env python3
"""Build deterministic, symlink-free API and worker archives from one checkout."""
import argparse
import gzip
import hashlib
import io
import os
import pathlib
import re
import tarfile

SOURCE_DIRS = ('scripts', 'services/governance', 'sdk/typescript')


def members(source, component):
    roots = (*SOURCE_DIRS, *(['node_modules'] if component in ('api', 'production-worker') else []))
    for root in roots:
        directory = source / root
        if not directory.is_dir() or directory.is_symlink():
            raise ValueError('Missing or linked source directory: ' + root)
        for current, directories, filenames in os.walk(directory, followlinks=False):
            current = pathlib.Path(current)
            directories[:] = sorted(name for name in directories
                                    if name not in ('.bin', '.cache', '__pycache__'))
            for name in directories:
                if (current / name).is_symlink():
                    raise ValueError('Unexpected directory symlink')
            for name in sorted(filenames):
                path = current / name
                if path.is_symlink() or not path.is_file():
                    raise ValueError('Unexpected non-file or symlink')
                yield path, path.relative_to(source).as_posix()


def package(source, output, component):
    if output.exists():
        raise ValueError('Output archive already exists')
    try:
        with output.open('xb') as destination:
            with gzip.GzipFile(filename='', mode='wb', fileobj=destination,
                               mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode='w') as archive:
                    for path, name in members(source, component):
                        info = tarfile.TarInfo(name)
                        info.uid = info.gid = 0
                        info.uname = info.gname = ''
                        info.mode = 0o644
                        info.mtime = 0
                        if name.startswith('services/governance/migrations/') and name.endswith('.sql'):
                            # Migration checksums are over SQL bytes. A Windows
                            # checkout can expand LF to CRLF even when the
                            # reviewed migration and live database use LF.
                            sql = path.read_bytes().replace(b'\r\n', b'\n')
                            if b'\r' in sql:
                                raise ValueError('Unsupported SQL line ending')
                            info.size = len(sql)
                            archive.addfile(info, io.BytesIO(sql))
                        else:
                            info.size = path.stat().st_size
                            with path.open('rb') as content:
                                archive.addfile(info, content)
        checksum = hashlib.sha256()
        with output.open('rb') as content:
            for block in iter(lambda: content.read(1024 * 1024), b''):
                checksum.update(block)
        return checksum.hexdigest()
    except (OSError, ValueError, tarfile.TarError):
        output.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=pathlib.Path, required=True)
    parser.add_argument('--output-dir', type=pathlib.Path, required=True)
    parser.add_argument('--release-id', required=True)
    parser.add_argument('--component', choices=('api', 'worker', 'production-worker', 'both'), default='both')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', args.release_id):
        raise ValueError('Invalid release ID')
    if not args.source.is_dir() or not args.output_dir.is_dir():
        raise ValueError('Existing source and output directories required')
    components = ('api', 'worker') if args.component == 'both' else (args.component,)
    for component in components:
        output = args.output_dir / (args.release_id + '-' + component + '.tar.gz')
        digest = package(args.source, output, component)
        print(f'{component}_archive={output};sha256={digest}')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, tarfile.TarError):
        print('pilot_runtime_package=failed')
        raise SystemExit(1) from None
