#!/usr/bin/env python3
"""Correct the staged, unused self-service worker database input path."""
import json
import os
import pathlib
import stat
import tempfile

OLD = '/etc/aichain/governance-workers/project-database-url'
NEW = '/etc/aichain/governance-workers/pilot-evidence-database-url'
FILES = (
    pathlib.Path('/etc/aichain/pilot-self-service-policy.json'),
    pathlib.Path('/etc/aichain/pilot-self-service-requests/00a8ec46f96de80a331676c9.json'),
)


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    if not pathlib.Path(NEW).is_file():
        raise ValueError('Existing worker database input required')
    for path in FILES:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 8192:
            raise ValueError('Protected file required')
        value = json.loads(path.read_text(encoding='utf-8'))
        if value.get('databaseUrlFile') != OLD:
            raise ValueError('Unexpected original database path')
        if path == FILES[1] and value.get('project') != 'prj-2e7bb2dd-b180-49f6-9083-22b84b402b66':
            raise ValueError('Unexpected acceptance project')
        value['databaseUrlFile'] = NEW
        fd, temporary = tempfile.mkstemp(prefix='.pilot-db-path-', dir=path.parent)
        try:
            os.fchmod(fd, 0o600)
            os.fchown(fd, 0, 0)
            with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                json.dump(value, stream, sort_keys=True)
                stream.write('\n')
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print('pilot_worker_database_path=corrected')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError):
        print('Pilot worker database path correction failed.')
        raise SystemExit(1) from None
