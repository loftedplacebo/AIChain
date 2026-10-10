#!/usr/bin/env python3
"""One-time protected diagnostic for the pending internal acceptance project."""
import importlib.util
import pathlib
import sys

SOURCE = pathlib.Path('/opt/aichain/governance-pilot-db-setup/provision-pilot-project-worker.py')
REQUEST = pathlib.Path('/etc/aichain/pilot-self-service-requests/00a8ec46f96de80a331676c9.json')


def main():
    if not REQUEST.is_file():
        raise ValueError('Expected protected request missing')
    sys.path.insert(0, str(SOURCE.parent))
    spec = importlib.util.spec_from_file_location('pilot_provision_diagnostic', SOURCE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sys.argv = [str(SOURCE), str(REQUEST)]
    try:
        module.main()
    except Exception as error:
        message = str(error)
        if any(token in message.lower() for token in ('password', 'postgresql://', 'secret', 'key=')):
            message = 'detail-redacted'
        print(f'provision_exception={type(error).__name__};reason={message[:240]}')
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
