#!/usr/bin/env bash

# exit on failure
set -e

# default to dev-ios profile instead of dev to fix opt-level issue
if [ -z "${CARGO_PROFILE:-}" ]; then
  export CARGO_PROFILE=dev-ios
fi

source $REPO_ROOT/scripts/common.sh

BRIDGE_ROOT=$REPO_ROOT/bridge

# build Swift bindings
cd $BRIDGE_ROOT/fedi-ffi
# note: using '--target-dir' or otherwise this build will completely invalidate previous ones already in the ./target
cargo run --target-dir "${CARGO_BUILD_TARGET_DIR}/ffi-bindgen-run" --package ffi-bindgen -- generate --language swift --out-dir $BRIDGE_ROOT/fedi-swift/Sources/Fedi "$BRIDGE_ROOT/fedi-ffi/src/fedi.udl"

cd $BRIDGE_ROOT

# TODO: both of these targets are needed by default until this issue is resolved:
# https://github.com/fedibtc/fedi/issues/2497
TARGETS=("aarch64-apple-ios-sim" "x86_64-apple-ios")
if [ "${BUILD_ALL_BRIDGE_TARGETS:-}" == "1" ]; then
  TARGETS=("aarch64-apple-ios-sim" "aarch64-apple-ios" "x86_64-apple-ios")
elif [ -n "${BRIDGE_TARGETS_TO_BUILD:-}" ]; then
  read -ra TARGETS <<< "${BRIDGE_TARGETS_TO_BUILD}"
fi
echo "Building iOS bridge for targets: ${TARGETS[*]} with profile: ${CARGO_PROFILE}"

network_check_pid=
network_check_log=
function wait_for_network_check() {
  local status=0
  local wait_started=$SECONDS
  wait "$network_check_pid" || status=$?
  network_check_pid=
  echo "::group::Check the iOS bridge does not trigger the Local Network prompt"
  cat "$network_check_log"
  echo "Wait for Local Network check: $((SECONDS - wait_started)) seconds"
  echo "::endgroup::"
  rm -f "$network_check_log"
  network_check_log=
  return "$status"
}
function cleanup_network_check() {
  local status=$?
  trap - EXIT
  trap '' HUP INT TERM
  if [ -n "$network_check_pid" ]; then
    if jobs -pr | grep -qx "$network_check_pid"; then
      kill -TERM "$network_check_pid" 2>/dev/null || true
    fi
    wait_for_network_check || true
  fi
  if [ -n "$network_check_log" ]; then rm -f "$network_check_log"; fi
  exit "$status"
}
if [ "${CHECK_IOS_LOCAL_NETWORK:-}" = "1" ]; then
  if [[ " ${TARGETS[*]} " != *" aarch64-apple-ios-sim "* ]]; then
    echo "error: the Local Network check requires the ARM simulator target" >&2
    exit 1
  fi
  trap cleanup_network_check EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
fi

# clean any old binaries
# shellcheck disable=SC2046
rm -f $(find $CARGO_BUILD_TARGET_DIR -name libfediffi.a | grep -v '/deps/')

# build binaries for each supported target
for target in "${TARGETS[@]}"; do
  check_packages=()
  if [ "${CHECK_IOS_LOCAL_NETWORK:-}" = "1" ] && [ "$target" = "aarch64-apple-ios-sim" ]; then
    check_packages=(--package ios-local-network-prompt-check)
  fi
  # Pre-A11 devices (the A10 iPhone 7, down to the A9 on iOS 15.1) have no
  # ARMv8.1 LSE atomics. Left unpinned, a newer Apple toolchain can compile
  # aws-lc with CAS/CASAL, which SIGILL on those chips and crash the app on its
  # first TLS handshake. Pin the device arm64 C build to the A7 baseline so it
  # falls back to the ldxr/stxr loop. Simulator and x86 run on modern hardware.
  cpu_pin=()
  if [ "$target" = "aarch64-apple-ios" ]; then
    cpu_pin=("TARGET_CFLAGS=${TARGET_CFLAGS:-} -mcpu=apple-a7")
  fi
  env "${cpu_pin[@]}" cargo build --target-dir "${CARGO_BUILD_TARGET_DIR}" --package fedi-ffi "${check_packages[@]}" ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}} --target $target $CARGO_FLAGS
  if [ "${#check_packages[@]}" -ne 0 ]; then
    network_check_log=$(mktemp "${TMPDIR:-/tmp}/ios-local-network-prompt-check-log.XXXXXX")
    "$REPO_ROOT/scripts/bridge/check-ios-local-network-prompt.sh" --run-only > "$network_check_log" 2>&1 &
    network_check_pid=$!
  fi
done

for target in "${TARGETS[@]}"; do
  "$REPO_ROOT/scripts/bridge/check-ios-min-version-imports.sh" \
    "$CARGO_BUILD_TARGET_DIR/$target/${CARGO_PROFILE_DIR}/libfediffi.a"
done

# make sure build artifacts are available to the fedi-swift Xcode package
cd $BRIDGE_ROOT/fedi-swift
mv Sources/Fedi/fedi.swift Sources/Fedi/Fedi.swift || true

# we need to copy some files required by the Xcode framework
# there are 2 available libraries defined in fediFFI.xcframework/Info.plist
# - ios-arm64_x86_64-simulator
# - ios-arm64

# copy header files to their respective framework directories
echo "Copying header files..."
cp Sources/Fedi/fediFFI.h fediFFI.xcframework/ios-arm64/fediFFI.framework/Headers
cp Sources/Fedi/fediFFI.h fediFFI.xcframework/ios-arm64_x86_64-simulator/fediFFI.framework/Headers

# copy binary files to their respective framework directories
echo "Copying binary files..."
# for development, we combine both x86 and aarch64 binaries into 1
# since x86_64-apple-ios-sim is not supported as a rustc target we just use x86_64-apple-ios
AARCH64_SIM_BINARY_PATH=$CARGO_BUILD_TARGET_DIR/aarch64-apple-ios-sim/${CARGO_PROFILE_DIR}/libfediffi.a
X86_BINARY_PATH=$CARGO_BUILD_TARGET_DIR/x86_64-apple-ios/${CARGO_PROFILE_DIR}/libfediffi.a
COMBINED_BINARY_DIR=$CARGO_BUILD_TARGET_DIR/lipo-ios-arm64_x86_64-simulator/${CARGO_PROFILE_DIR}
COMBINED_BINARY_PATH="$COMBINED_BINARY_DIR/libfediffi.a"
if [[ -e "$AARCH64_SIM_BINARY_PATH" && -e "$X86_BINARY_PATH" ]]; then
  echo "Combining binaries for development..."
  mkdir -p "$COMBINED_BINARY_DIR"
  if [ "$AARCH64_SIM_BINARY_PATH" -nt "$COMBINED_BINARY_PATH" ] ||
    [ "$X86_SIM_BINARY_PATH" -nt "$COMBINED_BINARY_PATH" ] ; then
    lipo $AARCH64_SIM_BINARY_PATH $X86_BINARY_PATH \
      -create -output "$COMBINED_BINARY_PATH"
  fi
  cp \
    $COMBINED_BINARY_PATH \
    fediFFI.xcframework/ios-arm64_x86_64-simulator/fediFFI.framework/fediFFI
else
  # otherwise just use the aarch64 simulator binary
  cp $AARCH64_SIM_BINARY_PATH fediFFI.xcframework/ios-arm64_x86_64-simulator/fediFFI.framework/fediFFI
fi

# ios-arm64
# copy the aarch64 binary if it was built
AARCH64_BINARY_PATH=$CARGO_BUILD_TARGET_DIR/aarch64-apple-ios/${CARGO_PROFILE_DIR}/libfediffi.a
if [ -e "$AARCH64_BINARY_PATH" ]; then
  cp $AARCH64_BINARY_PATH fediFFI.xcframework/ios-arm64/fediFFI.framework/fediFFI
else
  echo "aarch64-apple-ios binary was not built..."
fi

if [ -n "$network_check_pid" ]; then wait_for_network_check; fi

echo -e "\x1B[32;1miOS bridge build complete.\x1B[0m"
