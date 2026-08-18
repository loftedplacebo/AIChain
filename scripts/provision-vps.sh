#!/usr/bin/env bash
set -euo pipefail

# Run as root only for initial private-development provisioning.
# This script does not change SSH settings, firewall rules, or expose JSON-RPC.

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this initial provisioning script as root." >&2
  exit 1
fi

project_dir="${PROJECT_DIR:-/opt/aichain}"
go_version="1.21.13"
go_archive="go${go_version}.linux-amd64.tar.gz"
go_checksum="502fc16d5910562461e6a6631fb6377de2322aad7304bf2bcd23500ba9dab4a7"
go_url="https://go.dev/dl/${go_archive}"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This initial provisioning script supports apt-based Linux hosts only." >&2
  exit 1
fi

apt-get update
apt-get install --yes --no-install-recommends ca-certificates curl git build-essential jq

if [[ -e "$project_dir/.git" ]]; then
  git -C "$project_dir" fetch origin
  git -C "$project_dir" checkout main
  git -C "$project_dir" pull --ff-only origin main
else
  git clone --recurse-submodules https://github.com/loftedplacebo/AIChain.git "$project_dir"
fi
git -C "$project_dir" submodule update --init --recursive

toolchain_dir="$project_dir/.toolchains/go${go_version}"
if [[ ! -x "$toolchain_dir/go/bin/go" ]]; then
  archive_path="/tmp/$go_archive"
  curl --fail --location --silent --show-error --output "$archive_path" "$go_url"
  echo "$go_checksum  $archive_path" | sha256sum --check --status
  mkdir -p "$toolchain_dir"
  tar -C "$toolchain_dir" -xzf "$archive_path"
  rm -f "$archive_path"
fi

export GOROOT="$toolchain_dir/go"
export PATH="$GOROOT/bin:$PATH"
export CGO_ENABLED=1
export GOCACHE="$project_dir/.gocache"
export GOMODCACHE="$project_dir/.gomodcache"
mkdir -p "$GOCACHE" "$GOMODCACHE" "$project_dir/bin"

(cd "$project_dir/node/core-geth" && go build -buildvcs=false -trimpath -o "$project_dir/bin/core-geth" ./cmd/geth)
"$project_dir/bin/core-geth" version

echo "VPS baseline provisioned at $project_dir."
echo "Next: create an account privately, initialize a new devnet data directory, and start the node using scripts/start-devnet-node.sh."
