#!/usr/bin/env python3
"""Install a project-scoped write key for one internal synthetic watcher run."""
import base64
import getpass
import os
import pathlib
import pwd
import re
import stat
import tempfile

DEST = pathlib.Path('/etc/orvessian-chain-watch-internal.env')
STATE = pathlib.Path('/var/lib/orvessian-chain-watch-internal')
SERVICE = 'orvessian-chain-watch'
TENANT = 'org-61f98eac-1218-439d-9e93-f3717e1dfe37'
PROJECT = 'prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c'


def main():
    if os.geteuid() != 0 or not os.isatty(0):
        raise ValueError('Run as root at an interactive terminal')
    if DEST.exists() or DEST.is_symlink():
        raise ValueError('Internal project key already installed; inspect before replacing')
    user = pwd.getpwnam(SERVICE)
    existing = pathlib.Path('/etc/orvessian-chain-watch.env').lstat()
    if not stat.S_ISREG(existing.st_mode) or existing.st_uid != 0 or \
            existing.st_gid != user.pw_gid or stat.S_IMODE(existing.st_mode) != 0o640:
        raise ValueError('Protected existing OpenAI watcher configuration required')
    token = getpass.getpass('SDK Receipt Smoke Test write-only key: ').strip()
    if not re.fullmatch(r'ovk_[a-f0-9]{64}', token):
        raise ValueError('Expected a project key; no file written')
    STATE.mkdir(mode=0o700, exist_ok=True)
    info = STATE.lstat()
    if not stat.S_ISDIR(info.st_mode) or STATE.is_symlink() or \
            stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('Private agent state directory required')
    os.chown(STATE, user.pw_uid, user.pw_gid)
    lines = (
        'ORVESSIAN_TOKEN_B64=' + base64.b64encode(token.encode('ascii')).decode('ascii'),
        'ORVESSIAN_TENANT=' + TENANT,
        'ORVESSIAN_PROJECT=' + PROJECT,
        'AGENT_STATE_FILE=' + str(STATE / 'state.json'),
    )
    fd, temporary = tempfile.mkstemp(prefix='.orvessian-chain-watch-internal.', dir='/etc')
    try:
        os.fchmod(fd, 0o640)
        os.fchown(fd, 0, user.pw_gid)
        with os.fdopen(fd, 'w', encoding='ascii') as stream:
            stream.write('\n'.join(lines) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, DEST)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Internal project key installed for one synthetic run; no secret printed.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError):
        raise SystemExit('Internal project key setup failed; inspect protected configuration.') from None
