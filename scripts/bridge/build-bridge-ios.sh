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
cargo run --target-dir "${CARGO_BUILD_TARGET_DIR}/pkg/ffi-bindgen/ffi-bindgen-run" --package ffi-bindgen -- generate --language swift --out-dir $BRIDGE_ROOT/fedi-swift/Sources/Fedi "$BRIDGE_ROOT/fedi-ffi/src/fedi.udl"

cd $BRIDGE_ROOT

# TODO: both of these targets are needed by default until this issue is resolved:
# https://github.com/fedibtc/fedi/issues/2497
TARGETS=("aarch64-apple-ios-sim" "x86_64-apple-ios")
if [ "${BUILD_ALL_BRIDGE_TARGETS:-}" == "1" ]; then
  TARGETS=("aarch64-apple-ios-sim" "aarch64-apple-ios" "x86_64-apple-ios")
fi
echo "Building iOS bridge for targets: ${TARGETS[*]} with profile: ${CARGO_PROFILE}"

# clean any old binaries
# shellcheck disable=SC2046
rm -f $(find $CARGO_BUILD_TARGET_DIR/pkg/ffi-bindgen -name libfediffi.a | grep -v '/deps/')

# build binaries for each supported target
for target in "${TARGETS[@]}"; do
  cargo build --target-dir "${CARGO_BUILD_TARGET_DIR}/pkg/fedi-ffi" --package fedi-ffi ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}} --target $target $CARGO_FLAGS
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
AARCH64_SIM_BINARY_PATH=$CARGO_BUILD_TARGET_DIR/pkg/fedi-ffi/aarch64-apple-ios-sim/${CARGO_PROFILE_DIR}/libfediffi.a
X86_BINARY_PATH=$CARGO_BUILD_TARGET_DIR/pkg/fedi-ffi/x86_64-apple-ios/${CARGO_PROFILE_DIR}/libfediffi.a
COMBINED_BINARY_DIR=$CARGO_BUILD_TARGET_DIR/pkg/fedi-ffi/lipo-ios-arm64_x86_64-simulator/${CARGO_PROFILE_DIR}
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
AARCH64_BINARY_PATH=$CARGO_BUILD_TARGET_DIR/pkg/fedi-ffi/aarch64-apple-ios/${CARGO_PROFILE_DIR}/libfediffi.a
if [ -e "$AARCH64_BINARY_PATH" ]; then
  cp $AARCH64_BINARY_PATH fediFFI.xcframework/ios-arm64/fediFFI.framework/fediFFI
else
  echo "aarch64-apple-ios binary was not built..."
fi

echo -e "\x1B[32;1miOS bridge build complete.\x1B[0m"
