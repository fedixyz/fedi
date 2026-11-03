#!/usr/bin/env bash
set -euo pipefail
set -m

source_root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/ios-network-tests.XXXXXX")
test_pid=
watchdog_pid=
cleanup() {
  if [ -n "$test_pid" ]; then kill -KILL -- "-$test_pid" 2>/dev/null || true; wait "$test_pid" 2>/dev/null || true; fi
  if [ -n "$watchdog_pid" ]; then kill "$watchdog_pid" 2>/dev/null || true; wait "$watchdog_pid" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkfifo "$work/watchdog"
exec 9<> "$work/watchdog"

cat > "$work/command" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
event() { echo "$1" >> "$FIXTURE_ROOT/events"; }
value() {
  local flag=$1
  shift
  while [ "$1" != "$flag" ]; do shift; done
  echo "$2"
}
case "${0##*/}" in
  git) echo "$FIXTURE_ROOT" ;;
  cargo)
    if [ "$1" = run ]; then
      out=$(value --out-dir "$@")
      touch "$out/fedi.swift" "$out/fediFFI.h"
    else
      target=$(value --target "$@")
      echo "$*" >> "$FIXTURE_ROOT/cargo"
      if [ "$target" = aarch64-apple-ios ] && [ "$CHECK_IOS_LOCAL_NETWORK" = 1 ]; then
        read -r -t 5 -u 7
        event device-overlap
      fi
      if [ "$target" = "${FAIL_TARGET:-}" ]; then exit 19; fi
      out=$(value --target-dir "$@")/$target/ci
      mkdir -p "$out"
      touch "$out/libfediffi.a"
      if [[ " $* " = *" --package ios-local-network-prompt-check "* ]]; then
        printf '#!/bin/sh\nexit 0\n' > "$out/ios-local-network-prompt-check"
        chmod +x "$out/ios-local-network-prompt-check"
      fi
      if [ "$target" = x86_64-apple-ios ]; then printf '\n' >&8; fi
    fi ;;
  lipo) touch "$(value -output "$@")" ;;
  xcrun-fixture)
    if [[ " $* " = *" clang "* ]]; then
      touch "$(value -o "$@")"
    else
      while [ "$1" != --set ]; do shift; done
      action=$3
      event "$action"
      if [ "$action" = "${FAIL_SIM_PHASE:-}" ]; then exit 28; fi
      case "$action" in
        create) echo fixture-simulator ;;
        spawn)
          printf '\n\n' >&7
          # An early exit would skip the overlap and cancellation behavior under test.
          if [ "$HOLD_CHECK" = 1 ]; then read -r -t 5 -u 8; fi
          event spawn-ended
          exit "${CHECK_EXIT:-0}" ;;
        shutdown) printf '\n' >&8 ;;
      esac
    fi ;;
esac
SH
chmod +x "$work/command"

cat > "$work/shell-env" <<'SH'
# The checker invokes Apple's xcrun by absolute path through env -i.
env() {
  local arg
  for arg in "$@"; do
    if [ "$arg" = /usr/bin/xcrun ]; then
      while [ "$1" != /usr/bin/xcrun ]; do shift; done
      shift
      "$FIXTURE_ROOT/bin/xcrun-fixture" "$@"
      return $?
    fi
  done
  command env "$@"
}
SH

fail() { cat "$FIXTURE_ROOT/output"; echo "FAIL $case_name: $*" >&2; exit 1; }
seen() { grep -qx "$1" "$FIXTURE_ROOT/events" || fail "missing $1"; }
before() {
  local first second
  first=$(grep -nx "$1" "$FIXTURE_ROOT/events") || fail "missing $1"
  second=$(grep -nx "$2" "$FIXTURE_ROOT/events") || fail "missing $2"
  [ "${first%%:*}" -lt "${second%%:*}" ] || fail "$1 must precede $2"
}

for case_name in overlap check-failure build-failure build-cancel boot-failure standalone standalone-cancel opt-in missing-target missing-binary; do
  export FIXTURE_ROOT="$work/$case_name"
  export REPO_ROOT="$FIXTURE_ROOT" CARGO_BUILD_TARGET_DIR="$FIXTURE_ROOT/target" TMPDIR="$FIXTURE_ROOT/tmp"
  export CARGO_PROFILE=ci CARGO_FLAGS='' BUILD_ALL_BRIDGE_TARGETS=1 CHECK_IOS_LOCAL_NETWORK=1
  export HOLD_CHECK=1
  export BASH_ENV="$work/shell-env"
  unset FAIL_TARGET FAIL_SIM_PHASE CHECK_EXIT BRIDGE_TARGETS_TO_BUILD
  mkdir -p "$FIXTURE_ROOT"/{scripts/bridge,bridge/fedi-ffi,bridge/fedi-swift/Sources/Fedi,bin,target,tmp}
  mkfifo "$FIXTURE_ROOT/started" "$FIXTURE_ROOT/finish"
  exec 7<> "$FIXTURE_ROOT/started" 8<> "$FIXTURE_ROOT/finish"
  cp "$source_root/scripts/common.sh" "$FIXTURE_ROOT/scripts/"
  cp "$source_root/scripts/bridge/"{build-bridge-ios,check-ios-local-network-prompt}.sh "$FIXTURE_ROOT/scripts/bridge/"
  for arch in ios-arm64 ios-arm64_x86_64-simulator; do
    mkdir -p "$FIXTURE_ROOT/bridge/fedi-swift/fediFFI.xcframework/$arch/fediFFI.framework/Headers"
  done
  for command in cargo git lipo xcrun-fixture; do ln -s "$work/command" "$FIXTURE_ROOT/bin/$command"; done
  printf '#!/bin/sh\nexit 0\n' > "$FIXTURE_ROOT/scripts/bridge/check-ios-min-version-imports.sh"
  chmod +x "$FIXTURE_ROOT/scripts/bridge/check-ios-min-version-imports.sh"
  touch "$FIXTURE_ROOT/events" "$FIXTURE_ROOT/cargo"
  script=build-bridge-ios.sh
  set --
  expected=0
  case "$case_name" in
    check-failure) export CHECK_EXIT=1; expected=1 ;;
    build-failure) export FAIL_TARGET=aarch64-apple-ios; expected=19 ;;
    build-cancel|standalone-cancel) expected=143 ;;
    standalone) export HOLD_CHECK=0 ;;
    boot-failure) export FAIL_SIM_PHASE=boot; expected=28 ;;
    opt-in) export CHECK_IOS_LOCAL_NETWORK=0 ;;
    missing-target) export BUILD_ALL_BRIDGE_TARGETS=0 BRIDGE_TARGETS_TO_BUILD=x86_64-apple-ios; expected=1 ;;
    missing-binary) set -- --run-only; expected=1 ;;
  esac
  case "$case_name" in standalone*|boot-failure|missing-binary) script=check-ios-local-network-prompt.sh ;; esac
  PATH="$FIXTURE_ROOT/bin:$PATH" bash "$FIXTURE_ROOT/scripts/bridge/$script" "$@" > "$FIXTURE_ROOT/output" 2>&1 &
  test_pid=$!
  (trap - EXIT INT TERM; read -r -t 10 -u 9 || kill -KILL -- "-$test_pid" 2>/dev/null) &
  watchdog_pid=$!
  case "$case_name" in
    *-cancel)
      read -r -t 5 -u 7 || fail 'check did not start'
      kill -TERM "$test_pid" ;;
  esac
  status=0
  wait "$test_pid" || status=$?
  test_pid=
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
  watchdog_pid=
  [ "$status" -eq "$expected" ] || fail "exit $status, expected $expected"
  case "$case_name" in
    opt-in|missing-target|missing-binary)
      [ ! -s "$FIXTURE_ROOT/events" ] || fail 'simulator started unexpectedly' ;;
    *)
      seen shutdown
      seen delete
      [ -z "$(ls -A "$TMPDIR")" ] || fail 'temporary files remain' ;;
  esac
  case "$case_name" in
    overlap)
      before spawn device-overlap
      before device-overlap spawn-ended
      [ "$(wc -l < "$FIXTURE_ROOT/cargo")" -eq 3 ] || fail 'expected one Cargo call per target'
      [ "$(grep -c -- '--package ios-local-network-prompt-check' "$FIXTURE_ROOT/cargo")" -eq 1 ] || fail 'checker built more than once'
      grep -q -- '--package ios-local-network-prompt-check.*--target aarch64-apple-ios-sim' "$FIXTURE_ROOT/cargo" || fail 'checker target'
      grep -q 'Local Network check:' "$FIXTURE_ROOT/output" || fail 'missing timing' ;;
    build-failure|*-cancel) before shutdown spawn-ended ;;
    standalone) [ "$(wc -l < "$FIXTURE_ROOT/cargo")" -eq 1 ] || fail 'standalone Cargo count' ;;
    missing-target) grep -q 'requires the ARM simulator target' "$FIXTURE_ROOT/output" || fail 'wrong target error' ;;
    missing-binary) [ ! -s "$FIXTURE_ROOT/cargo" ] || fail 'run-only invoked Cargo' ;;
  esac
  echo "PASS $case_name"
done
