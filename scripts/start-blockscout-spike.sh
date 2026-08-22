#!/usr/bin/env bash
# Start the private, localhost-only Blockscout compatibility spike.

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_root="${BLOCKSCOUT_SOURCE_ROOT:-$project_root/services/blockscout-source}"
runtime_env="${BLOCKSCOUT_RUNTIME_ENV:-$project_root/.env.blockscout}"
compose_base="$source_root/docker-compose/geth.yml"
compose_override="$project_root/deploy/blockscout/compose.aichain.yml"

if [[ ! -f "$compose_base" ]]; then
  echo "Official Blockscout Compose template not found: $compose_base" >&2
  exit 1
fi
if [[ ! -f "$runtime_env" ]]; then
  echo "Blockscout runtime env file not found. Run scripts/create-blockscout-runtime-env.sh first." >&2
  exit 1
fi

docker compose -p aichain-blockscout \
  --env-file "$runtime_env" \
  -f "$compose_base" -f "$compose_override" up -d \
  redis-db db backend visualizer sig-provider frontend stats-db stats proxy
docker compose -p aichain-blockscout \
  --env-file "$runtime_env" \
  -f "$compose_base" -f "$compose_override" ps
