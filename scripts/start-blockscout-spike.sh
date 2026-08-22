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

# The official Compose template bind-mounts these state directories into a
# non-root Blockscout container. The source checkout may have been cloned by
# root on the VPS, so prepare only these runtime directories for that service.
mkdir -p "$source_root/docker-compose/services/dets" \
  "$source_root/docker-compose/services/logs"
chown 10001:10001 "$source_root/docker-compose/services/dets" \
  "$source_root/docker-compose/services/logs"

compose=(docker compose -p aichain-blockscout --env-file "$runtime_env" \
  -f "$compose_base" -f "$compose_override")

# Create the Compose network before determining its private bridge gateway.
# `create` does not start a backend with the temporary default host mapping.
if ! docker network inspect aichain-blockscout_default >/dev/null 2>&1; then
  "${compose[@]}" create backend
fi

docker_gateway="$(docker network inspect aichain-blockscout_default \
  --format '{{(index .IPAM.Config 0).Gateway}}')"
if [[ -z "$docker_gateway" ]]; then
  echo "Unable to determine the Blockscout Docker-network gateway." >&2
  exit 1
fi
export BLOCKSCOUT_DOCKER_GATEWAY="$docker_gateway"

# Node 1 intentionally keeps JSON-RPC on 127.0.0.1. Docker containers cannot
# reach that address on the host, so expose a relay only on this Compose
# network's private gateway, never on the VPS public interface.
rpc_bridge_name="aichain-blockscout-rpc-bridge"
expected_bridge="bind=$docker_gateway"
if docker container inspect "$rpc_bridge_name" >/dev/null 2>&1; then
  current_bridge="$(docker inspect "$rpc_bridge_name" --format '{{join .Args " "}}')"
  if [[ "$current_bridge" != *"$expected_bridge"* ]]; then
    docker rm -f "$rpc_bridge_name" >/dev/null
  fi
fi
if ! docker container inspect "$rpc_bridge_name" >/dev/null 2>&1; then
  docker run -d --name "$rpc_bridge_name" --restart unless-stopped --network host \
    alpine/socat \
    "TCP4-LISTEN:18545,bind=$docker_gateway,reuseaddr,fork" TCP4:127.0.0.1:8545
fi

# Start (or reconcile) the stack with the exact private-gateway mapping.
"${compose[@]}" up -d \
  redis-db db backend visualizer sig-provider frontend stats-db stats proxy
"${compose[@]}" ps
