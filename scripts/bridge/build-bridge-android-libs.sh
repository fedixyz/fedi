#!/usr/bin/env bash

# exit on failure
set -euo pipefail

source "$REPO_ROOT/scripts/common.sh"
mkdir -p "$HOME/.parallel"
touch "$HOME/.parallel/will-cite"

if [ -f "$REPO_ROOT/scripts/enforce-nix.sh" ]; then
  "$REPO_ROOT/scripts/enforce-nix.sh"
else
  >&2 echo "Skipping Nix enforcement"
fi

# Check for and clean polluted aws-lc-sys CMake cache
# If the CMake cache contains macOS SDK paths or deployment targets, the Android
# build will fail with linker errors like "unknown argument '-search_paths_first'".
# This detects and cleans only the polluted directories, avoiding a full cargo clean.
# It is only intended for local non-release builds. CI uses a separate nix build
# path, and release/deployment entry points pass CARGO_PROFILE=release.
#
# Note: CMAKE_OSX_ARCHITECTURES:UNINITIALIZED=arm64 is benign and should NOT
# trigger cleaning. We only clean when CMAKE_OSX_SYSROOT or CMAKE_OSX_DEPLOYMENT_TARGET
# contain actual macOS values.
_clean_polluted_cmake_cache() {
  if [ -n "${CI:-}" ] || [ "${CARGO_PROFILE:-}" = "release" ]; then
    >&2 echo "Skipping aws-lc-sys cache cleanup for CI/release build."
    return
  fi

  local target_dir="${CARGO_BUILD_TARGET_DIR:-$REPO_ROOT/target-nix}"
  local cleaned=0

  # Find aws-lc-sys CMake cache files in Android build directories
  while IFS= read -r cache_file; do
    # Check for actual macOS pollution:
    # - CMAKE_OSX_SYSROOT with a path containing MacOSX/Xcode
    # - CMAKE_OSX_DEPLOYMENT_TARGET with a version number
    local is_polluted=0
    if grep -qE "CMAKE_OSX_SYSROOT.*=.*(MacOSX|Xcode)" "$cache_file" 2>/dev/null; then
      is_polluted=1
    fi
    if grep -qE "CMAKE_OSX_DEPLOYMENT_TARGET.*=.+[0-9]" "$cache_file" 2>/dev/null; then
      is_polluted=1
    fi

    if [ "$is_polluted" -eq 1 ]; then
      # Get the aws-lc-sys build directory (parent of out/build)
      local build_dir
      build_dir="$(dirname "$(dirname "$(dirname "$cache_file")")")"
      >&2 echo "Detected polluted CMake cache in: $cache_file"
      >&2 echo "Cleaning: $build_dir"
      rm -rf "$build_dir"
      cleaned=$((cleaned + 1))
    fi
  done < <(find "$target_dir" -path "*android*" -path "*aws-lc-sys*" -name "CMakeCache.txt" 2>/dev/null)

  if [ "$cleaned" -gt 0 ]; then
    >&2 echo "Cleaned $cleaned polluted aws-lc-sys build directories."
    >&2 echo "Continuing with build..."
  fi
}

_clean_polluted_cmake_cache

# shorter aliases used from now on
export build_deps_only="${FM_BUILD_BRIDGE_ANDROID_LIBS_DEPS_ONLY:-}"
export libs_out="${FM_BUILD_BRIDGE_ANDROID_LIBS_OUT:-}"

if [ -z "$build_deps_only" ]; then
  if [ -z "$libs_out" ]; then
    >&2 echo "Must set FM_BUILD_BRIDGE_ANDROID_LIBS_OUT to path where to output androids libs"
    exit 1
  fi
fi

# Resource management function to throttle compilation processes
# We don't want to build everything in parallel all at once
# What we want instead, is to start a new build when the existing ones
# reach their bottleneck and stop utilizing machine's full capacity
# e.g. matrix-sdk or linking which are unfortunately single-threaded.
# For this - wait until you don't see enough rustc processes
function wait_for_build_capacity() {
  local target="$1"

  # Calculate threshold: half of available CPU cores + 1
  local cpu_cores
  cpu_cores="$(nproc)"
  local threshold="$((cpu_cores / 2 + 1 ))"

  >&2 echo "Building android bridge for $target: CPU cores detected: $cpu_cores, threshold set to: $threshold"

  while true ; do
    # Check if there are any compilation processes running
    local cur_running
    cur_running="$(ps -ax -o comm= | { grep -E "rustc|clang" || true; } | wc -l)"

    >&2 echo "Building android bridge for $target: CHECK - Current compilation processes running: $cur_running"

    if [[ "$cur_running" -lt "$threshold" ]]; then
      >&2 echo "Building android bridge for $target: System ready: current processes ($cur_running) is under the threshold ($threshold)"
      break
    fi

    local wait_time=$((RANDOM % 10 + 1))
    >&2 echo "Building android bridge for $target: WAIT - System busy ($cur_running compilation processes running), waiting ${wait_time}s..."
    sleep "$wait_time"
  done
}
export -f wait_for_build_capacity

function build_android_target() {
  set -euo pipefail

  local target="$1"

  # If we use the same target dir, all builds will wait for each other
  export CARGO_BUILD_ANDROID_TARGET_DIR="$CARGO_BUILD_TARGET_DIR/android-$target"

  # Wait for system capacity before starting build
  wait_for_build_capacity "$target"

  >&2 echo "Building android bridge for $target: START"

  cargo build \
    -q \
    --target-dir "${CARGO_BUILD_ANDROID_TARGET_DIR}" ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}} -p fedi-ffi --target "$target"

  echo "Target $target built to $CARGO_BUILD_ANDROID_TARGET_DIR: DONE"

  if [ -z "$build_deps_only" ]; then
    jni_name="arm64-v8a"
    if [ "${target:-}" == "aarch64-linux-android" ]; then
      jni_name=arm64-v8a
    fi
    if [ "${target:-}" == "x86_64-linux-android" ]; then
      jni_name=x86_64
    fi
    if [ "${target:-}" == "armv7-linux-androideabi" ]; then
      jni_name=armeabi-v7a
    fi

    mkdir -p "$libs_out/jniLibs/$jni_name/"
    cp "$CARGO_BUILD_ANDROID_TARGET_DIR/${target}/$CARGO_PROFILE_DIR/libfediffi.so" "$libs_out/jniLibs/$jni_name/"
  fi
}
export -f build_android_target


# Use parallel to build all targets concurrently

if [ -z "${BRIDGE_TARGETS_TO_BUILD:-}" ]; then
  TARGETS=("aarch64-linux-android" "x86_64-linux-android" "armv7-linux-androideabi")
else
  TARGETS=("${BRIDGE_TARGETS_TO_BUILD[@]}")
fi

export BRIDGE_ROOT=$REPO_ROOT/bridge

(
  cd "$BRIDGE_ROOT"

  echo "Building android bridge for targets: ${TARGETS[*]}"
  for target in "${TARGETS[@]}"; do
    echo "build_android_target $target"
  done | parallel --verbose --jobs 3 --halt-on-error 1 --ungroup --delay 5

)

(
  cd "$BRIDGE_ROOT/fedi-ffi"

  # note: using '--target-dir' or otherwise this build will completely invalidate previous ones already in the target
  CARGO_FFI_BINDINGS_TARGET_DIR="$CARGO_BUILD_TARGET_DIR/ffi-bindgen-run"
  if [ -n "$build_deps_only" ]; then
    >&2 echo "Pre-building ffi-bindgen"
    cargo build --target-dir "$CARGO_FFI_BINDINGS_TARGET_DIR" \
      --package ffi-bindgen
  else
    >&2 echo "Generating FFI bindings"
    mkdir -p "$libs_out/fedi-ffi"
    cargo run --target-dir "$CARGO_FFI_BINDINGS_TARGET_DIR" \
      --package ffi-bindgen \
      -- \
      generate --language kotlin \
      --out-dir "$libs_out/fedi-ffi/" "${BRIDGE_ROOT}/fedi-ffi/src/fedi.udl"
  fi
)
