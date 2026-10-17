#!/usr/bin/env bash
set -euo pipefail

# Root-only operator entrypoint; the API service never receives the owner key.
[[ $(id -u) -eq 0 ]] || { echo 'Root operator required' >&2; exit 2; }
release=/opt/aichain/orvessian-production-funding
script=$release/scripts/fund-production-relayer.cjs
[[ -f $script && ! -L $script && $(stat -c '%U:%G %a' "$script") == 'root:root 600' ]] || {
  echo 'Pinned Production funding tool required' >&2; exit 2;
}
export NODE_PATH=/opt/aichain/orvessian-production-api/node_modules
exec /opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node "$script" "$@"
