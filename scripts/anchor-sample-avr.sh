#!/usr/bin/env bash
# Compatibility wrapper for the committed Phase 1B sample receipt.
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec bash "$SCRIPT_DIR/anchor-avr.sh" "$SCRIPT_DIR/../fixtures/avr/receipt-v0.1.0-draft.json"
