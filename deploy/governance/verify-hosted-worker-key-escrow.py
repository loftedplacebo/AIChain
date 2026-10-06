#!/usr/bin/env python3
"""Compare 1Password escrow copies with hosted worker keys without printing them."""
import getpass
import hmac
import os
import pathlib
import re


KEYS = (
    ('recording-service', pathlib.Path('/var/lib/aichain-governance-pilot-worker/keys/recording-service.key')),
    ('relayer', pathlib.Path('/var/lib/aichain-governance-pilot-worker/keys/relayer.key')),
)


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    matched = True
    for label, file in KEYS:
        supplied = getpass.getpass(f'1Password hosted pilot {label} private key: ').strip()
        if not re.fullmatch(r'0x[a-fA-F0-9]{64}', supplied):
            raise SystemExit(f'{label}: INVALID FORMAT')
        stored = file.read_text(encoding='ascii').strip()
        valid = hmac.compare_digest(supplied.lower(), stored.lower())
        print(f'{label}: ' + ('MATCH' if valid else 'DOES NOT MATCH'))
        matched &= valid
    if not matched:
        raise SystemExit(1)
    print('Both hosted worker keys are escrowed and match the protected files.')


if __name__ == '__main__':
    main()
