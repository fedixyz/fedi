#!/usr/bin/env bash
# Fails when the iOS bridge's networking makes iOS ask users for Local Network access.

set -euo pipefail

if [ -z "${CARGO_PROFILE:-}" ]; then
  export CARGO_PROFILE=dev-ios
fi

source "$REPO_ROOT/scripts/common.sh"

target=aarch64-apple-ios-sim
case "${1:-}" in
  "") cargo build --target-dir "${CARGO_BUILD_TARGET_DIR}" --package ios-local-network-prompt-check --profile "${CARGO_PROFILE}" --target "$target" ${CARGO_FLAGS:-} ;;
  --run-only) ;;
  *) echo "usage: $0 [--run-only]" >&2; exit 1 ;;
esac
bin="$CARGO_BUILD_TARGET_DIR/$target/$CARGO_PROFILE_DIR/ios-local-network-prompt-check"
if [ ! -x "$bin" ]; then
  echo "error: the Local Network check binary is missing: $bin" >&2
  exit 1
fi

SECONDS=0
work=$(mktemp -d "${TMPDIR:-/tmp}/ios-local-network-prompt-check.XXXXXX")
mkdir "$work/devices"
xcrun=(env -i PATH=/usr/bin:/bin HOME="$HOME" SIMCTL_CHILD_DYLD_INSERT_LIBRARIES="$work/hook.dylib" /usr/bin/xcrun)
simctl=("${xcrun[@]}" simctl --set "$work/devices")
udid=
spawn_pid=
function cleanup() {
  if [ -n "$udid" ]; then
    "${simctl[@]}" shutdown "$udid" > /dev/null 2>&1 || true
    "${simctl[@]}" delete "$udid" > /dev/null 2>&1 || true
  fi
  if [ -n "$spawn_pid" ]; then wait "$spawn_pid" 2>/dev/null || true; fi
  rm -rf "$work"
  echo "Local Network check: $SECONDS seconds"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

"${xcrun[@]}" --sdk iphonesimulator clang -dynamiclib -target arm64-apple-ios15.0-simulator -Wl,-U,_sendmsg_x \
  -o "$work/hook.dylib" "$REPO_ROOT/bridge/ios-local-network-prompt-check/hook.c"

udid=$("${simctl[@]}" create ios-local-network-prompt-check com.apple.CoreSimulator.SimDeviceType.iPhone-16)
"${simctl[@]}" boot "$udid"

"${simctl[@]}" spawn "$udid" "$bin" &
spawn_pid=$!
wait "$spawn_pid"
echo "the iOS bridge does not trigger the Local Network prompt"
