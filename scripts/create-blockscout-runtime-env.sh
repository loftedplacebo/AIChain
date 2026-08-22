#!/usr/bin/env bash
# Generate non-committed credentials for the private Blockscout development spike.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_env="${BLOCKSCOUT_RUNTIME_ENV:-$project_root/.env.blockscout}"

if [[ -e "$runtime_env" ]]; then
  echo "Refusing to overwrite existing Blockscout runtime env file: $runtime_env" >&2
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate runtime credentials." >&2
  exit 1
fi

umask 077
db_password="$(openssl rand -hex 32)"
stats_password="$(openssl rand -hex 32)"
secret_key_base="$(openssl rand -base64 48 | tr -d '\n')"
printf 'BLOCKSCOUT_DB_PASSWORD=%s\nBLOCKSCOUT_STATS_DB_PASSWORD=%s\nBLOCKSCOUT_SECRET_KEY_BASE=%s\n' \
  "$db_password" "$stats_password" "$secret_key_base" > "$runtime_env"
echo "Created private Blockscout runtime env file: $runtime_env"
