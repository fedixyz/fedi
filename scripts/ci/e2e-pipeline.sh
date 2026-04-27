#!/usr/bin/env bash
#
# Parallelized e2e pipeline. Called by the GHA workflow; devs can also
# invoke it directly to drive the same flow locally. The interactive
# device-picker version lives in scripts/ui/run-{android,ios}-e2e.sh.
#
# Usage:
#   ./scripts/ci/e2e-pipeline.sh android
#   ./scripts/ci/e2e-pipeline.sh ios
#
# Each background task's stdout/stderr goes to $E2E_LOG_DIR/<name>.log
# and its exit code to <name>.exit so wait_for can report status even
# after `wait` has reaped the PID.
#
# Env knobs:
#   TESTS_TO_RUN        space-separated test names or "all" (default: all)
#   SKIP_BRIDGE=1       don't rebuild the Rust bridge
#   FAIL_FAST=1         stop on first device test failure
#   PERSIST_SERVICES=1  skip teardown so emulators/metro/appium stay alive
#                       (useful when iterating locally)
#   DEBUG_MODE=1        dump each task's log inline at pipeline end,
#                       wrapped in GHA ::group:: blocks for collapsibility

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel)}"
APPIUM_HOME="${APPIUM_HOME:-$REPO_ROOT/ui/.appium}"
E2E_LOG_DIR="${E2E_LOG_DIR:-$APPIUM_HOME/pipeline}"
mkdir -p "$E2E_LOG_DIR"

declare -A _E2E_PIDS=()
declare -A _E2E_T0=()

declare -A _TASK_EMOJI=(
    [emulators]="🤖"
    [simulators]="📱"
    [bridge]="🦀"
    [yarn-install]="🧶"
    [wasm]="🕸️"
    [build-deps]="🔷"
    [cocoapods]="☕"
    [debug-bundle]="🎁"
    [build-ios]="🍏"
    [appium]="🕹️"
    [metro]="🚇"
)
declare -A _TASK_LABEL=(
    [emulators]="Android emulators"
    [simulators]="iOS simulators"
    [bridge]="Rust bridge"
    [yarn-install]="yarn deps"
    [wasm]="wasm module"
    [build-deps]="shared TS packages"
    [cocoapods]="CocoaPods"
    [debug-bundle]="Android debug bundle"
    [build-ios]="iOS build"
    [appium]="Appium server"
    [metro]="Metro bundler"
)
_ts() { date +%s; }

_fmt_dur() {
    local total="$1"
    if [ "$total" -lt 60 ]; then
        echo "${total}sec"
    else
        local m=$((total / 60))
        local r=$((total % 60))
        echo "${m}min ${r}sec"
    fi
}

_emoji() { echo "${_TASK_EMOJI[$1]:-📋}"; }
_label() { echo "${_TASK_LABEL[$1]:-$1}"; }

# Usage: _gate "up-next-description" dep1 dep2 ...
_gate() {
    local next="$1"
    shift
    echo ""
    echo "⏳ Starting: $next"
    echo "   waiting for:"
    local n
    for n in "$@"; do
        echo "     • $(_emoji "$n") $(_label "$n")"
    done
}

run_async() {
    local name="$1"
    shift
    local log="$E2E_LOG_DIR/$name.log"
    local exit_file="$E2E_LOG_DIR/$name.exit"
    rm -f "$exit_file"
    _E2E_T0[$name]=$(_ts)
    echo "🚀 $(_emoji "$name") Starting $(_label "$name")..."
    (
        # background children should not inherit set -e; we capture rc manually
        set +e
        "$@" >"$log" 2>&1
        echo $? >"$exit_file"
    ) &
    _E2E_PIDS[$name]=$!
}

wait_for() {
    local name="$1"
    local pid="${_E2E_PIDS[$name]:-}"
    if [ -z "$pid" ]; then
        echo "  ❌ $(_emoji "$name") $(_label "$name"): unknown task — pipeline DAG bug"
        exit 1
    fi
    local log="$E2E_LOG_DIR/$name.log"
    # Use $exit_file rather than `wait`'s rc: survives after PID is reaped.
    wait "$pid" 2>/dev/null || true
    local rc
    rc=$(cat "$E2E_LOG_DIR/$name.exit" 2>/dev/null || echo 1)
    local t0="${_E2E_T0[$name]}"
    local dur=$(($(_ts) - t0))
    if [ "$rc" = "0" ]; then
        echo "  ✅ $(_emoji "$name") $(_label "$name") ready ($(_fmt_dur "$dur"))"
        unset "_E2E_PIDS[$name]"
    else
        echo "  ❌ $(_emoji "$name") $(_label "$name") failed (exit $rc, $(_fmt_dur "$dur"))"
        echo "  ── last 200 lines of ${log#"$REPO_ROOT"/} ──"
        tail -200 "$log" 2>/dev/null || true
        exit "$rc"
    fi
}

wait_all() {
    local n
    for n in "$@"; do wait_for "$n"; done
}

# Launch Metro as a synchronous step (not run_async): start-metro.sh forks
# the actual metro process, so control returns quickly. We still want
# consistent 🚀/✅ output.
start_metro() {
    local t0
    t0=$(_ts)
    echo "🚀 $(_emoji metro) Starting $(_label metro)..."
    bash "$REPO_ROOT/scripts/ui/start-metro.sh" >"$E2E_LOG_DIR/metro.log" 2>&1
    local metro_pid_file="$REPO_ROOT/metro_pid.txt"
    if [ -f "$metro_pid_file" ]; then
        local metro_pid
        metro_pid=$(cat "$metro_pid_file")
        if ! kill -0 "$metro_pid" 2>/dev/null; then
            echo "  ❌ $(_emoji metro) $(_label metro) died early"
            tail -100 "$REPO_ROOT/metro.log" 2>/dev/null || true
            exit 1
        fi
    fi
    echo "  ✅ $(_emoji metro) $(_label metro) ready ($(_fmt_dur $(($(_ts) - t0))))"
}

_dump_logs_if_debug() {
    if [ -z "${DEBUG_MODE:-}" ]; then
        return
    fi
    echo ""
    echo "═══ task logs (DEBUG_MODE=1) ═══"
    local name log
    for name in "${!_E2E_T0[@]}"; do
        log="$E2E_LOG_DIR/$name.log"
        [ -f "$log" ] || continue
        echo "::group::$(_emoji "$name") $(_label "$name")"
        cat "$log"
        echo "::endgroup::"
    done
    # Metro runs synchronously via start_metro, not run_async, so its logs
    # aren't under _E2E_T0.
    if [ -f "$REPO_ROOT/metro.log" ]; then
        echo "::group::$(_emoji metro) $(_label metro)"
        cat "$REPO_ROOT/metro.log"
        echo "::endgroup::"
    fi
}

_e2e_cleanup() {
    _dump_logs_if_debug
    if [ -n "${PERSIST_SERVICES:-}" ]; then
        return
    fi
    echo ""
    echo "🧹 Teardown"
    "$REPO_ROOT/scripts/ci/stop-all-e2e-services.sh" 2>/dev/null || true
}

_banner() {
    local platform="$1"
    echo "═══ $platform e2e pipeline ═══"
    echo "   tests=${TESTS_TO_RUN:-all}  skip_bridge=${SKIP_BRIDGE:-0}  fail_fast=${FAIL_FAST:-0}  persist_services=${PERSIST_SERVICES:-0}  debug_mode=${DEBUG_MODE:-0}"
}

_pre_cleanup() {
    echo ""
    echo "🧹 Cleaning up previous e2e services..."
    "$REPO_ROOT/scripts/ci/stop-all-e2e-services.sh" 2>/dev/null || true
    # stop-all-e2e-services.sh doesn't always reach these.
    lsof -ti:4723 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:8081 2>/dev/null | xargs kill -9 2>/dev/null || true
    if [ -n "${CLEAN_UI_FILES:-}" ]; then
        NON_INTERACTIVE=1 bash "$REPO_ROOT/scripts/ui/clean-ui.sh"
    fi
}

# Usage: _finish_pipeline platform summary_rows pipeline_start rc
_finish_pipeline() {
    _e2e_write_step_summary "$1" "$2"
    echo ""
    echo "✨ Done in $(_fmt_dur $(($(_ts) - $3))) (exit $4)"
}

# ─────────────────────────────────────────────────────────────────────────
# Android pipeline DAG
#
#   emulators          ── (no deps)
#   bridge             ── (no deps)
#   yarn-install       ── (no deps)
#   wasm               ── (no deps)
#   appium             ── after yarn-install
#   build-deps         ── after yarn-install + wasm
#   metro              ── after build-deps (Metro caches "module not found"
#                                          for @fedi/common if started before
#                                          build-deps writes dist/)
#   debug-bundle       ── after bridge + build-deps
#   tests (per AVD)    ── after emulators + appium + debug-bundle
# ─────────────────────────────────────────────────────────────────────────
run_pipeline_android() {
    local tests="${TESTS_TO_RUN:-all}"
    local pipeline_start
    pipeline_start=$(_ts)

    trap _e2e_cleanup EXIT

    _banner "Android"
    _pre_cleanup
    adb kill-server 2>/dev/null || true
    adb start-server 2>/dev/null || true

    echo ""
    run_async emulators bash "$REPO_ROOT/scripts/ui/start-android-emulators.sh"
    if [ -z "${SKIP_BRIDGE:-}" ]; then
        run_async bridge env BUILD_ALL_BRIDGE_TARGETS=1 CARGO_PROFILE=ci \
            bash "$REPO_ROOT/scripts/bridge/build-bridge-android.sh"
    fi
    run_async yarn-install bash -c "cd '$REPO_ROOT/ui' && yarn install --frozen-lockfile"
    run_async wasm bash "$REPO_ROOT/scripts/ui/install-wasm.sh"

    _gate "🕹️  Appium" yarn-install
    wait_for yarn-install
    run_async appium env PLATFORM=android bash "$REPO_ROOT/scripts/ui/setup-and-start-appium.sh"

    _gate "🔷 shared TS packages" wasm
    wait_for wasm
    run_async build-deps bash -c "cd '$REPO_ROOT/ui' && yarn build:deps"

    if [ -n "${SKIP_BRIDGE:-}" ]; then
        _gate "🎁 debug bundle, 🚇 Metro" build-deps
        wait_for build-deps
    else
        _gate "🎁 debug bundle, 🚇 Metro" bridge build-deps
        wait_all bridge build-deps
    fi
    run_async debug-bundle bash "$REPO_ROOT/scripts/ci/build-android.sh"
    start_metro

    _gate "🧪 tests" emulators appium debug-bundle
    wait_all emulators appium debug-bundle

    local appium_port
    appium_port=$(cat "$APPIUM_HOME/appium_port.txt" 2>/dev/null || echo "4723")
    local apk_path="$REPO_ROOT/ui/native/android/app/build/outputs/apk/production/debug/app-production-debug.apk"
    if [ ! -f "$apk_path" ]; then
        echo "  ❌ APK missing at ${apk_path#"$REPO_ROOT"/}"
        exit 1
    fi

    local overall_rc=0
    local summary_rows=""
    local avds=(android-7.1 android-14)
    local avd
    for avd in "${avds[@]}"; do
        echo ""
        echo "🧪 Running $tests on $avd..."
        pushd "$REPO_ROOT/ui" >/dev/null
        local rc=0
        local t0
        t0=$(_ts)
        PLATFORM=android AVD="$avd" BUNDLE_PATH="$apk_path" APPIUM_PORT="$appium_port" \
            ts-node "$REPO_ROOT/ui/native/tests/appium/runner.ts" $tests \
            || rc=$?
        popd >/dev/null
        local dur=$(($(_ts) - t0))
        if [ "$rc" = "0" ]; then
            echo "  ✅ $avd passed ($(_fmt_dur "$dur"))"
            summary_rows+="| $avd | pass |"$'\n'
        else
            echo "  ❌ $avd failed (exit $rc, $(_fmt_dur "$dur"))"
            summary_rows+="| $avd | FAIL |"$'\n'
            overall_rc=1
            [ -n "${FAIL_FAST:-}" ] && break
        fi
    done

    _finish_pipeline "Android" "$summary_rows" "$pipeline_start" "$overall_rc"
    return $overall_rc
}

# ─────────────────────────────────────────────────────────────────────────
# iOS pipeline DAG
#
#   simulators         ── (no deps)
#   bridge             ── (no deps)
#   yarn-install       ── (no deps)
#   wasm               ── (no deps)
#   appium             ── after yarn-install
#   cocoapods          ── after bridge (pod install links fedi-swift bindings
#                                       generated by bridge)
#   build-deps         ── after yarn-install + wasm
#   metro              ── after build-deps (avoids stale "module not found"
#                                          cache for @fedi/common)
#   build-ios          ── after cocoapods + build-deps
#   tests (per UDID)   ── after simulators + appium + build-ios
#
# iOS 15 failure is tolerated (gui runner's 15.5 simruntime lacks
# XCTest.framework); FAIL_FAST=1 overrides.
# ─────────────────────────────────────────────────────────────────────────
run_pipeline_ios() {
    local tests="${TESTS_TO_RUN:-all}"
    local pipeline_start
    pipeline_start=$(_ts)

    trap _e2e_cleanup EXIT

    # Local runs: point GITHUB_ENV at a file so start-ios-simulators.sh's
    # UDID exports flow back into this shell (GHA sets it in CI).
    if [ -z "${GITHUB_ENV:-}" ]; then
        export GITHUB_ENV="$E2E_LOG_DIR/github_env"
    fi
    : > "$GITHUB_ENV"

    _banner "iOS"
    _pre_cleanup

    echo ""
    run_async simulators \
        nix develop .#xcode -c bash "$REPO_ROOT/scripts/ui/start-ios-simulators.sh"
    if [ -z "${SKIP_BRIDGE:-}" ]; then
        run_async bridge \
            nix develop -L .#xcode --command env HOME="$HOME" \
                BUILD_ALL_BRIDGE_TARGETS=1 CARGO_PROFILE=ci \
                bash "$REPO_ROOT/scripts/ci/run-in-fs-dir-cache.sh" \
                build-bridge-ios \
                "$REPO_ROOT/scripts/bridge/build-bridge-ios.sh"
    fi
    run_async yarn-install bash -c "cd '$REPO_ROOT/ui' && yarn install --frozen-lockfile"
    run_async wasm bash "$REPO_ROOT/scripts/ui/install-wasm.sh"

    _gate "🕹️  Appium" yarn-install
    wait_for yarn-install
    run_async appium env PLATFORM=ios bash "$REPO_ROOT/scripts/ui/setup-and-start-appium.sh"

    if [ -z "${SKIP_BRIDGE:-}" ]; then
        _gate "☕ CocoaPods" bridge
        wait_for bridge
    fi
    run_async cocoapods nix develop .#xcode -c bash "$REPO_ROOT/scripts/ui/install-ios-deps.sh"

    _gate "🔷 shared TS packages" wasm
    wait_for wasm
    run_async build-deps bash -c "cd '$REPO_ROOT/ui' && yarn build:deps"

    _gate "🍏 iOS build, 🚇 Metro" cocoapods build-deps
    wait_all cocoapods build-deps
    run_async build-ios nix develop .#xcode -c bash "$REPO_ROOT/scripts/ci/build-ios.sh"
    start_metro

    _gate "🧪 tests" simulators appium build-ios
    wait_all simulators appium build-ios

    set -a
    # shellcheck source=/dev/null
    source "$GITHUB_ENV" 2>/dev/null || true
    set +a

    local appium_port
    appium_port=$(cat "$APPIUM_HOME/appium_port.txt" 2>/dev/null || echo "4723")
    local app_path="$REPO_ROOT/ui/native/ios/build/Build/Products/Debug-iphonesimulator/FediReactNative.app"
    if [ ! -d "$app_path" ]; then
        echo "  ❌ iOS .app missing at ${app_path#"$REPO_ROOT"/}"
        exit 1
    fi

    local overall_rc=0
    local summary_rows=""

    # iOS 15 failure tolerated: gui runner's iOS 15.5 simruntime is missing
    # XCTest.framework. FAIL_FAST=1 overrides.
    if [ -n "${IOS_15_UDID:-}" ]; then
        echo ""
        echo "🧪 Running $tests on ios-15..."
        pushd "$REPO_ROOT/ui" >/dev/null
        local ios15_rc=0
        local t0
        t0=$(_ts)
        PLATFORM=ios DEVICE_ID="$IOS_15_UDID" BUNDLE_PATH="$app_path" APPIUM_PORT="$appium_port" \
            nix develop .#xcode -c ts-node "$REPO_ROOT/ui/native/tests/appium/runner.ts" $tests \
            || ios15_rc=$?
        popd >/dev/null
        local dur=$(($(_ts) - t0))
        if [ "$ios15_rc" = "0" ]; then
            echo "  ✅ ios-15 passed ($(_fmt_dur "$dur"))"
            summary_rows+="| ios-15 | pass |"$'\n'
        else
            echo "  ⚠️  ios-15 failed, tolerated (exit $ios15_rc, $(_fmt_dur "$dur"))"
            summary_rows+="| ios-15 | FAIL (tolerated) |"$'\n'
            if [ -n "${FAIL_FAST:-}" ]; then
                overall_rc=$ios15_rc
                _finish_pipeline "iOS" "$summary_rows" "$pipeline_start" "$overall_rc"
                return $overall_rc
            fi
        fi
    fi

    if [ -n "${IOS_26_UDID:-}" ]; then
        echo ""
        echo "🧪 Running $tests on ios-26..."
        pushd "$REPO_ROOT/ui" >/dev/null
        local ios26_rc=0
        local t0
        t0=$(_ts)
        PLATFORM=ios DEVICE_ID="$IOS_26_UDID" BUNDLE_PATH="$app_path" APPIUM_PORT="$appium_port" \
            nix develop .#xcode -c ts-node "$REPO_ROOT/ui/native/tests/appium/runner.ts" $tests \
            || ios26_rc=$?
        popd >/dev/null
        local dur=$(($(_ts) - t0))
        if [ "$ios26_rc" = "0" ]; then
            echo "  ✅ ios-26 passed ($(_fmt_dur "$dur"))"
            summary_rows+="| ios-26 | pass |"$'\n'
        else
            echo "  ❌ ios-26 failed (exit $ios26_rc, $(_fmt_dur "$dur"))"
            summary_rows+="| ios-26 | FAIL |"$'\n'
            overall_rc=1
        fi
    fi

    _finish_pipeline "iOS" "$summary_rows" "$pipeline_start" "$overall_rc"
    return $overall_rc
}

_e2e_write_step_summary() {
    local platform="$1"
    local rows="$2"
    local summary="${GITHUB_STEP_SUMMARY:-}"
    [ -z "$summary" ] && return 0
    {
        echo "## $platform E2E Results"
        echo "| Device | Result |"
        echo "|--------|--------|"
        printf "%s" "$rows"
        echo ""
        echo "tests=\`${TESTS_TO_RUN:-all}\` skip_bridge=\`${SKIP_BRIDGE:-0}\` fail_fast=\`${FAIL_FAST:-0}\`"
    } >>"$summary"
}

case "${1:-}" in
    android) run_pipeline_android ;;
    ios)     run_pipeline_ios ;;
    *)       echo "usage: $0 android|ios" >&2; exit 1 ;;
esac
