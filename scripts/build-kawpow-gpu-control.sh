#!/usr/bin/env bash
set -euo pipefail

expected_commit="632f6ea0a5cd09e2c6443374dbe6db0a767715ba"

if [[ $# -lt 1 || $# -gt 3 ]]; then
  echo "Usage: $0 /absolute/path/to/kawpowminer-source [absolute-build-dir] [cuda|opencl]" >&2
  exit 2
fi

source_dir="$1"
build_dir="${2:-$source_dir/build-aichain-g1}"
backend="${3:-cuda}"
compute_arch="${AICHAIN_KAWPOW_COMPUTE:-}"
compat_cxx_flags="${AICHAIN_KAWPOW_CXX_FLAGS:-}"

if [[ "$source_dir" != /* || "$build_dir" != /* ]]; then
  echo "Source and build paths must be absolute." >&2
  exit 2
fi
if [[ ! -d "$source_dir/.git" ]]; then
  echo "Source directory is not a Git checkout: $source_dir" >&2
  exit 2
fi
if [[ "$backend" != "cuda" && "$backend" != "opencl" ]]; then
  echo "Backend must be cuda or opencl." >&2
  exit 2
fi
if [[ -n "$compute_arch" && ! "$compute_arch" =~ ^[0-9]+$ ]]; then
  echo "AICHAIN_KAWPOW_COMPUTE must be a CUDA compute capability without punctuation (for example 86)." >&2
  exit 2
fi

for command_name in git cmake sha256sum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 2
  fi
done

actual_commit="$(git -C "$source_dir" rev-parse HEAD)"
if [[ "$actual_commit" != "$expected_commit" ]]; then
  echo "Unexpected kawpowminer revision: $actual_commit" >&2
  echo "Expected: $expected_commit" >&2
  exit 2
fi

submodule_status="$(git -C "$source_dir" submodule status --recursive)"
if grep -Eq '^[+-U]' <<<"$submodule_status"; then
  echo "Submodules are missing, modified, or conflicted. Run:" >&2
  echo "  git -C '$source_dir' submodule update --init --recursive" >&2
  exit 2
fi

cuda_flag=OFF
opencl_flag=OFF
if [[ "$backend" == "cuda" ]]; then
  cuda_flag=ON
else
  opencl_flag=ON
fi

cmake_args=(
  -S "$source_dir"
  -B "$build_dir"
  -DETHASHCUDA="$cuda_flag"
  -DETHASHCL="$opencl_flag"
  -DAPICORE=ON
  -DCMAKE_BUILD_TYPE=Release
)
if [[ -n "$compute_arch" ]]; then
  cmake_args+=("-DCOMPUTE=$compute_arch")
fi
if [[ -n "$compat_cxx_flags" ]]; then
  cmake_args+=("-DCMAKE_CXX_FLAGS=$compat_cxx_flags")
fi

cmake "${cmake_args[@]}"
cmake --build "$build_dir" --parallel "$(nproc)"

mapfile -t miner_binaries < <(find "$build_dir" -type f -name kawpowminer -perm -111)
if [[ ${#miner_binaries[@]} -ne 1 ]]; then
  echo "Expected exactly one executable kawpowminer binary; found ${#miner_binaries[@]}." >&2
  printf '  %s\n' "${miner_binaries[@]}" >&2
  exit 1
fi

echo "Pinned KawPoW GPU control miner built successfully."
echo "Binary: ${miner_binaries[0]}"
sha256sum "${miner_binaries[0]}"
