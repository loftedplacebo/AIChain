"""JSON CLI for general receipts. Inputs are receipt payloads, not fixture wrappers."""
import argparse
import json
from pathlib import Path
from verification_receipt import derive_verification_receipt, prepare_verification_anchor, prepare_verification_attestation, validate_receipt_profile


def main():
    commands = {'derive': derive_verification_receipt, 'prepare-anchor': prepare_verification_anchor, 'prepare-attestation': prepare_verification_attestation, 'validate-profile': validate_receipt_profile}
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=commands)
    parser.add_argument('receipt')
    parser.add_argument('profile', nargs='?')
    args = parser.parse_args()
    receipt = json.loads(Path(args.receipt).read_text(encoding='utf-8'))
    if args.command == 'validate-profile':
        if not args.profile:
            parser.error('validate-profile requires a profile JSON file')
        result = validate_receipt_profile(receipt, json.loads(Path(args.profile).read_text(encoding='utf-8')))
    else:
        result = commands[args.command](receipt)
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    main()
