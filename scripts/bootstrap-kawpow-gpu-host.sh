#!/usr/bin/env bash
# Prepare a disposable CUDA host to act as an isolated AIChain KawPoW miner.
# This script deliberately exposes no RPC or P2P listener.  Network wiring is
# supplied later through private SSH relays by the test harness.
set -euo pipefail

project_root="${AICHAIN_BOOTSTRAP_ROOT:-/workspace/aichain}"
repo_url="${AICHAIN_REPOSITORY_URL:-https://github.com/loftedplacebo/AIChain.git}"
repo_ref="${AICHAIN_REPOSITORY_REF:-main}"
miner_root="${AICHAIN_MINER_ROOT:-/workspace/kawpowminer}"
build_dir="${AICHAIN_MINER_BUILD_DIR:-$miner_root/build-aichain-cuda86}"
compute="${AICHAIN_KAWPOW_COMPUTE:-86}"
expected_miner_commit="632f6ea0a5cd09e2c6443374dbe6db0a767715ba"

[[ "$project_root" == /* && "$miner_root" == /* && "$build_dir" == /* ]] || {
  echo "Bootstrap paths must be absolute." >&2; exit 2;
}
[[ "$compute" =~ ^[0-9]+$ ]] || { echo "AICHAIN_KAWPOW_COMPUTE must be numeric." >&2; exit 2; }

missing=()
for command_name in apt-get git cmake g++ make python3 go nvidia-smi; do
  command -v "$command_name" >/dev/null 2>&1 || missing+=("$command_name")
done
if (( ${#missing[@]} > 0 )); then
  if [[ "$(id -u)" != 0 ]]; then
    printf 'Missing prerequisites (run as root to install): %s\n' "${missing[*]}" >&2
    exit 2
  fi
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y git cmake build-essential python3 golang-go
fi

nvidia-smi --query-gpu=name,compute_cap --format=csv,noheader

if [[ ! -d "$project_root/.git" ]]; then
  # Do not recurse here: Core-Geth carries large test-data submodules. The
  # explicit updates below fetch only the node and cpp-kawpow dependencies.
  git clone "$repo_url" "$project_root"
fi
git -C "$project_root" fetch --tags origin
git -C "$project_root" checkout --detach "$repo_ref"
# The full Core-Geth test corpus is deliberately excluded: it is not a build
# dependency and makes ephemeral-host onboarding unnecessarily slow. cpp-kawpow
# is the only nested submodule required for the KawPoW development build.
git -C "$project_root" submodule update --init node/core-geth
git -C "$project_root/node/core-geth" submodule update --init consensus/kawpow/cpp-kawpow

mkdir -p "$project_root/build"
(cd "$project_root/node/core-geth" && go run build/ci.go install ./cmd/geth)
install -m 755 "$project_root/node/core-geth/build/bin/geth" "$project_root/build/core-geth-asert"

if [[ ! -d "$miner_root/.git" ]]; then
  git clone --recurse-submodules https://github.com/RavenCommunity/kawpowminer.git "$miner_root"
fi
git -C "$miner_root" fetch origin "$expected_miner_commit"
git -C "$miner_root" checkout --detach "$expected_miner_commit"
git -C "$miner_root" submodule update --init --recursive
git -C "$miner_root" apply --check "$project_root/patches/kawpowminer/0001-gcc13-cstdint.patch" 2>/dev/null || true
git -C "$miner_root" apply "$project_root/patches/kawpowminer/0001-gcc13-cstdint.patch" 2>/dev/null || true

# Keep Hunter state isolated per host and propagate the GCC 13 workaround into
# its nested Boost build, not only the parent CMake configuration.
export HUNTER_ROOT="${AICHAIN_HUNTER_ROOT:-/workspace/.hunter-aichain}"
export AICHAIN_KAWPOW_COMPUTE="$compute"
export AICHAIN_KAWPOW_CXX_FLAGS="-DPTHREAD_STACK_MIN=16384"
export CXXFLAGS="${CXXFLAGS:-} -DPTHREAD_STACK_MIN=16384"
bash "$project_root/scripts/build-kawpow-gpu-control.sh" "$miner_root" "$build_dir" cuda

miner_binary="$(find "$build_dir" -type f -name kawpowminer -perm -111 -print -quit)"
[[ -n "$miner_binary" ]] || { echo "KawPoW miner build did not produce a binary." >&2; exit 1; }
chmod +x "$project_root"/scripts/{prepare-kawpow-asert-run.sh,start-kawpow-asert-node.sh,supervise-kawpow-g3-miner.sh,capture-kawpow-asert-trial.py}

cat <<EOF
Bootstrap complete.
Core-Geth: $project_root/build/core-geth-asert
KawPoW miner: $miner_binary
Miner SHA-256: $(sha256sum "$miner_binary" | awk '{print $1}')
EOF
