#!/usr/bin/env bash
# Fails when the iOS bridge's networking makes iOS ask users for Local Network access.

set -euo pipefail

if [ -z "${CARGO_PROFILE:-}" ]; then
  export CARGO_PROFILE=dev-ios
fi

source "$REPO_ROOT/scripts/common.sh"

target=aarch64-apple-ios-sim
cargo build --target-dir "${CARGO_BUILD_TARGET_DIR}" --package ios-local-network-prompt-check --profile "${CARGO_PROFILE}" --target "$target" ${CARGO_FLAGS:-}
bin="$CARGO_BUILD_TARGET_DIR/$target/$CARGO_PROFILE_DIR/ios-local-network-prompt-check"

work=$(mktemp -d "${TMPDIR:-/tmp}/ios-local-network-prompt-check.XXXXXX")
mkdir "$work/devices"
xcrun=(env -i PATH=/usr/bin:/bin HOME="$HOME" SIMCTL_CHILD_DYLD_INSERT_LIBRARIES="$work/hook.dylib" /usr/bin/xcrun)
simctl=("${xcrun[@]}" simctl --set "$work/devices")
udid=
function cleanup() {
  if [ -n "$udid" ]; then
    "${simctl[@]}" shutdown "$udid" > /dev/null 2>&1 || true
    "${simctl[@]}" delete "$udid" > /dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

"${xcrun[@]}" --sdk iphonesimulator clang -dynamiclib -target arm64-apple-ios15.0-simulator -Wl,-U,_sendmsg_x \
  -o "$work/hook.dylib" "$REPO_ROOT/bridge/ios-local-network-prompt-check/hook.c"

udid=$("${simctl[@]}" create ios-local-network-prompt-check com.apple.CoreSimulator.SimDeviceType.iPhone-16)
"${simctl[@]}" boot "$udid"

"${simctl[@]}" spawn "$udid" "$bin"
echo "the iOS bridge does not trigger the Local Network prompt"
