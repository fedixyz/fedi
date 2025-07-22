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
    cp "$CARGO_BUILD_ANDROID_TARGET_DIR/pkg/fedi-ffi/${target}/$CARGO_PROFILE_DIR/libfediffi.so" "$libs_out/jniLibs/$jni_name/"
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
