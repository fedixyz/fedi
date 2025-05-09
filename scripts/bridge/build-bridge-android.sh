#!/usr/bin/env bash

# exit on failure
set -e


source "$REPO_ROOT/scripts/common.sh"

"$REPO_ROOT/scripts/enforce-nix.sh"

BUILD_ALL_BRIDGE_TARGETS=${BUILD_ALL_BRIDGE_TARGETS:-0}

# make sure to set the gradle user home so gradle doesn't try to use global cache in CI
export GRADLE_USER_HOME=$HOME/.gradle
echo "GRADLE_USER_HOME set to: $GRADLE_USER_HOME"

export BRIDGE_ROOT=$REPO_ROOT/bridge
cd "$BRIDGE_ROOT"

# only build emulator target by default
TARGETS=("aarch64-linux-android")

if [ "$BUILD_ALL_BRIDGE_TARGETS" == "1" ]; then
  TARGETS=("aarch64-linux-android" "x86_64-linux-android" "armv7-linux-androideabi")
fi
echo "Building android bridge for targets: ${TARGETS[*]}"


function build_android_target() {
  set -euo pipefail

  local target="$1"

  # If we use the same target dir, all builds will wait for each other
  export CARGO_BUILD_TARGET_DIR="$CARGO_BUILD_TARGET_DIR/android-$target"

  # We don't want to build everything in parallel all at once
  # What we want instead, is to start a new build when the existing ones
  # reach their bottleneck an stop utilizing machine's full capacity
  # e.g. matrix-sdk or linking which are unfortunately single-threaded.
  # For this - wait until you don't see enough rustc processes
  threshold="$(($(nproc) / 2 + 1 ))"
  while true ; do
    cur_running="$(ps -ax -o comm= | { grep -E "rustc|clang" || true; } | wc -l)"

    if [[ "$cur_running" -lt "$threshold" ]]; then
      break
    fi
    >&2 echo "Building android bridge for $target: WAIT ($cur_running vs $threshold)"
    sleep $((RANDOM % 10))
  done
  >&2 echo "Building android bridge for $target: START"

  cargo build \
    -q \
    --target-dir "${CARGO_BUILD_TARGET_DIR}" ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}} -p fedi-ffi --target "$target"

  JNILIBS_PATH="arm64-v8a"
  if [ "${target:-}" == "aarch64-linux-android" ]; then
    JNILIBS_PATH=arm64-v8a
  fi
  if [ "${target:-}" == "x86_64-linux-android" ]; then
    JNILIBS_PATH=x86_64
  fi
  if [ "${target:-}" == "armv7-linux-androideabi" ]; then
    JNILIBS_PATH=armeabi-v7a
  fi

  mkdir -p "$BRIDGE_ROOT/fedi-android/lib/src/main/jniLibs/${JNILIBS_PATH}"
  cp "${CARGO_BUILD_TARGET_DIR}/pkg/fedi-ffi/${target}/${CARGO_PROFILE_DIR}/libfediffi.so" fedi-android/lib/src/main/jniLibs/${JNILIBS_PATH}/libfediffi.so
  >&2 echo "Building android bridge for $target: DONE"
}
export -f build_android_target

# build binaries for each supported target
for target in "${TARGETS[@]}"; do
  echo "build_android_target $target"
done | parallel --jobs 3 --halt-on-error 1 --noswap --memfree 2G --ungroup --delay 5

# build android lib with ffi-bindgen inside nix
echo "Generating FFI bindings..."
cd "$BRIDGE_ROOT/fedi-ffi"
# note: using '--target-dir' or otherwise this build will completely invalidate previous ones already in the ./target
cargo run --target-dir "${CARGO_BUILD_TARGET_DIR}/ffi-bindgen-run" --package ffi-bindgen -- generate --language kotlin --out-dir "$BRIDGE_ROOT/fedi-android/lib/src/main/kotlin" "$BRIDGE_ROOT/fedi-ffi/src/fedi.udl"
echo "FFI bindgen completed."

# publish android package to a local maven repository so the app can locate it
echo "Publishing to local maven repository..."
cd "$BRIDGE_ROOT/fedi-android"
mkdir -p "$ANDROID_BRIDGE_ARTIFACTS"
./gradlew publishMavenPublicationToFediAndroidRepository
echo "Published to local maven repository."
