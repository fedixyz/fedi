#!/usr/bin/env bash
# Capture before/after/diff screenshots of a fedi ui PR for the sieve hub
# review, under $OUT_DIR ({before,after,diff}/NN-name.png). Needs the fedi
# dev shell and a runner that can boot an android emulator. Best-effort:
# every failure exits 0 so the review still publishes, just without images.
set -uo pipefail

repo=${REPO:?REPO (owner/name) is required}
number=${PR_NUMBER:?PR_NUMBER is required}
out_dir=${OUT_DIR:-$PWD/sieve-screenshots}

# the emulator rig only knows how to build and drive the fedi app
if [ "$repo" != "fedibtc/fedi" ]; then
    echo "capture only supports fedibtc/fedi (got $repo); skipping"
    exit 0
fi

pr=$(gh pr view "$number" --repo "$repo" --json state,headRefName,headRefOid,baseRefName,files) || {
    echo "::warning::could not read $repo#$number (token missing pull-requests: read?); skipping capture"
    exit 0
}
branch=$(jq -r '.headRefName' <<<"$pr")
base_branch=$(jq -r '.baseRefName' <<<"$pr")
if [ "$(jq -r '.state' <<<"$pr")" != "OPEN" ]; then
    echo "$repo#$number is not open; skipping capture"
    exit 0
fi
if ! jq -r '.files[].path' <<<"$pr" | grep -qE '^ui/(native|common)/'; then
    echo "$repo#$number does not touch ui/native or ui/common; skipping capture"
    exit 0
fi

workdir=$(mktemp -d "${TMPDIR:-/tmp}/sieve-capture.XXXXXX")
find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'sieve-capture.*' -not -path "$workdir" -mmin +180 -exec rm -rf {} + 2>/dev/null || true
emu_pid=""
# Six runner slots share this host's adb server, so kill only our own
# processes and never adb itself.
cleanup() {
    [ -n "$emu_pid" ] && kill "$emu_pid" 2>/dev/null
    # persistent runners would otherwise collect one throwaway avd per run
    if [ -n "${avd_path:-}" ]; then
        rm -rf "$avd_path" "${avd_path%/*}/${avd}.ini"
    fi
    rm -rf "$workdir"
}
trap cleanup EXIT
# bash skips EXIT traps on unhandled signals
trap 'exit 129' HUP INT TERM

if [ -n "${CLONE_REUSE:-}" ] && [ -d "$CLONE_REUSE/.git" ]; then
    # local iteration: skip the clone and reuse a previous run's checkout
    REPO_ROOT_CLONE="$CLONE_REUSE"
    git -C "$REPO_ROOT_CLONE" fetch -q origin "$branch" "$base_branch"
    git -C "$REPO_ROOT_CLONE" checkout -q --detach "origin/$branch"
else
    echo "Cloning $repo#$number ($branch) for capture"
    git clone --quiet --branch "$branch" \
        "https://x-access-token:${GH_TOKEN}@github.com/${repo}.git" "$workdir/repo"
    REPO_ROOT_CLONE="$workdir/repo"
fi
cd "$REPO_ROOT_CLONE" || exit 0
# the dev shell's REPO_ROOT names its own checkout, and install-wasm and
# build-bridge-android install their outputs into whatever it points at
export REPO_ROOT="$REPO_ROOT_CLONE"

head_sha=$(git rev-parse HEAD)
base_sha=$(git merge-base "origin/$base_branch" HEAD)

fail_soft() {
    echo "::warning::sieve capture stopped early: $1"
    exit 0
}

section() { printf '\n===== %s =====\n' "$1"; }

# One full apk per side: production-debug is not in the react native
# plugin's debuggableVariants, so gradle embeds the js bundle and the app
# ignores metro. One apk with metro per side diffs a build against itself.
build_side_apk() {
    local side=$1 sha=$2
    section "build $side apk ($sha)"
    git checkout -q "$sha"
    (cd ui && yarn install --frozen-lockfile) || return 1
    # gradle's js bundling resolves @fedi/injections through its
    # package.json main, which points into dist/, and that build chain
    # needs the wasm bindings present under ui/common
    ./scripts/ui/install-wasm.sh || return 1
    (cd ui && yarn build:deps) || return 1
    # match the profile CI already builds on this platform, so for ui-only
    # PRs the bridge is a nix cache hit: the linux runners build nightly
    # releases, the macos runners build the e2e ci profile
    local bridge_profile=release
    [ "$(uname)" = "Darwin" ] && bridge_profile=ci
    env BUILD_ALL_BRIDGE_TARGETS=1 CARGO_PROFILE="$bridge_profile" \
        ./scripts/bridge/build-bridge-android.sh || return 1
    ./scripts/ci/build-android.sh || return 1
    local built="$REPO_ROOT_CLONE/ui/native/android/app/build/outputs/apk/production/debug/app-production-debug.apk"
    [ -f "$built" ] || return 1
    cp -f "$built" "$workdir/$side.apk"
}

build_side_apk before "$base_sha" || fail_soft "before apk build failed"
build_side_apk after "$head_sha" || fail_soft "after apk build failed"
if cmp -s "$workdir/before.apk" "$workdir/after.apk"; then
    echo "before and after apks are identical; a diff would be vacuous but proves the screens"
fi

section "boot emulator"
# a hard-killed run leaks its emulator, and the e2e cleanup's reaper only
# greps qemu-system-x86_64, which an arm64 host never runs. macs run one
# slot per host; linux runs six, and this pkill would hit a live neighbor.
if [ "$(uname)" = "Darwin" ]; then
    pkill -f -- "-avd sieve-capture-" 2>/dev/null || true
fi
arch=$(uname -m)
case "$arch" in
x86_64) abi="x86_64" ;;
arm64 | aarch64) abi="arm64-v8a" ;;
*) fail_soft "unsupported arch $arch" ;;
esac
# pick the console port ourselves so the serial is known upfront; probing
# other serials can hang on the console of a leaked, dead emulator
emu_port=""
for p in $(seq 5570 2 5584); do
    if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then
        emu_port=$p
        break
    fi
    exec 3>&- 2>/dev/null
done
[ -n "$emu_port" ] || fail_soft "no free emulator console port"

# unique per job: concurrent runner slots would otherwise grab each
# other's device by avd name
avd="sieve-capture-$$"
avd_path="${ANDROID_AVD_HOME:-$HOME/.android/avd}/$avd"
# android-34 like the e2e AVDs: avdmanager cannot parse the android-36
# image's newer package schema and dies with "AVD not created. null"
echo "no" | avdmanager create avd \
    --force \
    --name "$avd" \
    --package "system-images;android-34;google_apis;$abi" \
    --path "$avd_path" \
    --tag "google_apis" || fail_soft "avd create failed"
if [ -f "$avd_path/config.ini" ]; then
    # avdmanager writes an absolute nix-store sysdir the emulator can't
    # resolve; same fix as start-android-emulators.sh
    sed -i.bak "s|^image\.sysdir\.1=.*system-images/|image.sysdir.1=system-images/|" "$avd_path/config.ini"
    {
        echo "hw.lcd.width=720"
        echo "hw.lcd.height=1280"
        echo "hw.lcd.density=320"
        echo "skin.name=720x1280"
        echo "hw.keyboard=yes"
    } >>"$avd_path/config.ini"
fi
# quickboot's file-backed ram image segfaults qemu under the linux
# runner units
emulator -avd "$avd" -port "$emu_port" \
    -no-snapshot -no-boot-anim -no-audio -no-window \
    -gpu swiftshader_indirect -accel auto \
    >"$workdir/emulator.log" 2>&1 &
emu_pid=$!

export ANDROID_SERIAL="emulator-$emu_port"
echo "device: $ANDROID_SERIAL"
if ! timeout 180 adb wait-for-device; then
    tail -30 "$workdir/emulator.log" || true
    fail_soft "emulator never registered with adb"
fi

booted=false
for _ in $(seq 1 30); do
    if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
        booted=true
        break
    fi
    sleep 10
done
if [ "$booted" != "true" ]; then
    tail -30 "$workdir/emulator.log" || true
    fail_soft "emulator did not boot"
fi

# Freeze the status bar (clock, battery) so before/after diffs only show
# real UI changes.
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1200 >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 >/dev/null
# mid-animation frames diff as phantom changes
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

# --- ui driver: same key semantics as the appium suite (accessibility id
# first, then resource-id), via uiautomator dump + input tap ---

dump_ui() {
    adb shell uiautomator dump /sdcard/sieve-ui.xml >/dev/null 2>&1
    adb exec-out cat /sdcard/sieve-ui.xml 2>/dev/null
}

# Prints "x y" center of the first node whose content-desc, resource-id, or
# text equals the key, or fails.
find_key() {
    local key=$1 xml node
    xml=$(dump_ui)
    node=$(grep -oE "<node[^>]*(content-desc=\"$key\"|resource-id=\"$key\"|text=\"$key\")[^>]*>" <<<"$xml" | head -1)
    [ -n "$node" ] || return 1
    sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/' <<<"$node" |
        awk '{ printf "%d %d", ($1+$3)/2, ($2+$4)/2 }'
}

# Taps the key, polling up to $2 seconds for it to appear. Scrolls up a bit
# every few misses in case the element is below the fold.
ui_tap() {
    local key=$1 timeout=${2:-90} waited=0 pos
    while [ "$waited" -lt "$timeout" ]; do
        if pos=$(find_key "$key"); then
            adb shell input tap $pos
            echo "tapped $key at $pos"
            sleep 2
            return 0
        fi
        sleep 3
        waited=$((waited + 3))
        if [ $((waited % 9)) -eq 0 ]; then
            adb shell input swipe 360 900 360 500 300
        fi
    done
    echo "::warning::ui_tap: $key not found after ${timeout}s"
    return 1
}

wait_for_key() {
    local key=$1 timeout=${2:-120} waited=0
    while [ "$waited" -lt "$timeout" ]; do
        find_key "$key" >/dev/null && return 0
        sleep 3
        waited=$((waited + 3))
    done
    return 1
}

# Settles the screen before a screenshot: two consecutive identical ui
# dumps (a dump takes about a second, so this is a few seconds of real
# time). Spinners never stabilize, which the iteration cap absorbs.
wait_idle() {
    local prev="" cur
    for _ in $(seq 1 8); do
        cur=$(dump_ui)
        if [ -n "$cur" ] && [ "$cur" = "$prev" ]; then
            return 0
        fi
        prev=$cur
        sleep 0.5
    done
    return 0
}

shoot() {
    local side=$1 name=$2
    mkdir -p "$out_dir/$side"
    wait_idle
    adb exec-out screencap -p >"$out_dir/$side/$name.png"
    echo "captured $side/$name.png"
}

# Clears whatever a station left on screen with BACK, then returns to the
# home tab. Never tap a surprise system dialog's buttons: that can
# navigate out of the app entirely.
reanchor() {
    local _
    for _ in 1 2 3; do
        find_key "HomeTabButton" >/dev/null && break
        adb shell input keyevent 4
        sleep 1
    done
    ui_tap "HomeTabButton" 15 >/dev/null 2>&1 || true
}

# Stations are best-effort: a failed tap loses that screen only, never
# the later stations.
tour_stations() {
    local side=$1

    reanchor
    shoot "$side" "04-home"

    ui_tap "ChatTabButton" 30 && shoot "$side" "05-chat"
    reanchor

    # tapping WalletTabButton while already on the wallet opens the wallet
    # switcher overlay instead of navigating (see the payments e2e), so
    # every station starts from home
    if ui_tap "WalletTabButton" 30; then
        # the backup reminder sheet can pop over the wallet and hide it
        ui_tap "BackupReminderDismissButton" 5 >/dev/null 2>&1 || true
        shoot "$side" "06-wallet"
        if ui_tap "Receive" 20; then
            shoot "$side" "07-receive"
        fi
    fi
    reanchor

    ui_tap "ModsTabButton" 30 && shoot "$side" "08-mods"
    reanchor

    if ui_tap "AvatarButton" 30; then
        shoot "$side" "09-account"
        # App Settings sits below the fold of the settings sheet, several
        # scrolls down
        if ui_tap "App Settings" 60; then
            shoot "$side" "10-app-settings"
        fi
    fi
    reanchor
}

# The same six taps setupOnboarded.ts uses: new seed, manual setup, join
# the Fedi Testnet federation, land on home. Every step is best-effort so
# a changed onboarding flow still yields the earlier screenshots.
tour() {
    local side=$1
    adb shell pm clear com.fedi >/dev/null
    adb shell monkey -p com.fedi -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    wait_for_key "Get started" 180 || {
        shoot "$side" "00-launch"
        return 0
    }
    shoot "$side" "01-welcome"
    ui_tap "Get started" || return 0
    ui_tap "No" 60 || return 0
    ui_tap "ManualSetupButton" 60 || return 0
    shoot "$side" "02-federation-list"
    ui_tap "FediTestnetJoinButton" 90 || return 0
    # the preview renders a loading placeholder until the federation
    # metadata arrives; shooting early diffs the two loading states
    wait_for_key "JoinFederationButton" 90 || true
    shoot "$side" "03-federation-preview"
    ui_tap "JoinFederationButton" 60 || return 0
    wait_for_key "HomeTabButton" 120 || return 0
    tour_stations "$side"
    return 0
}

run_side() {
    local side=$1
    section "capture: $side"
    adb install -r "$workdir/$side.apk" || return 1
    tour "$side"
    adb shell am force-stop com.fedi || true
}

run_side before || fail_soft "before-side capture failed"
run_side after || fail_soft "after-side capture failed"

section "diffs"
mkdir -p "$out_dir/diff"
manifest="$out_dir/captions.txt"
: >"$manifest"
for after_png in "$out_dir"/after/*.png; do
    [ -f "$after_png" ] || continue
    name=$(basename "$after_png" .png)
    before_png="$out_dir/before/$name.png"
    [ -f "$before_png" ] || continue
    # compare exits 1 on any difference; the AE metric goes to stderr.
    # The crop drops the status bar (clock and signal icons churn) from
    # the 720x1280 frames this script's avd produces.
    ae=$(compare -metric AE "${before_png}[720x1220+0+60]" "${after_png}[720x1220+0+60]" \
        -highlight-color red "$out_dir/diff/$name.png" 2>&1 || true)
    echo "$name: ${ae:-?} differing pixels" | tee -a "$manifest"
done

echo "capture complete: $(find "$out_dir" -name '*.png' | wc -l | tr -d ' ') images in $out_dir"
exit 0
