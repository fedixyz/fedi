#!/usr/bin/env bash
# Capture before/after/diff screenshots of a fedi ui PR for the sieve hub
# review, under $OUT_DIR ({before,after,diff}/NN-name.png). Needs the fedi
# dev shell and a runner that can boot an android emulator. Best-effort:
# every failure exits 0 so the review still publishes, just without images.
# A second leg per side joins a dev fed the script boots itself, for the
# screens only a funded wallet has. coverage.txt maps changed files to stations.
set -uo pipefail

repo=${REPO:?REPO (owner/name) is required}
number=${PR_NUMBER:?PR_NUMBER is required}
out_dir=${OUT_DIR:-$PWD/sieve-screenshots}
# any name the nightly list carries works, including the real federations
federation=${CAPTURE_FEDERATION:-Fedi Testnet}
fed_key=${federation// /}
fund_sats=10000
send_sats=1000

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
devfed_pid=""
devfed_dir="$workdir/devfed"
# a kill would orphan devimint's daemons; the parked command's exit is the
# clean shutdown, and the group kill is for a fed that never got that far
stop_devfed() {
    [ -n "$devfed_pid" ] || return 0
    touch "$devfed_dir/done"
    local waited=0
    while kill -0 "$devfed_pid" 2>/dev/null && [ "$waited" -lt 90 ]; do
        sleep 3
        waited=$((waited + 3))
    done
    kill -- "-$devfed_pid" 2>/dev/null || true
    git -C "$REPO_ROOT_CLONE" worktree remove --force "$devfed_dir/src" 2>/dev/null || true
}
# Six runner slots share this host's adb server, so kill only our own
# processes and never adb itself.
cleanup() {
    [ -n "$emu_pid" ] && kill "$emu_pid" 2>/dev/null
    stop_devfed
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
# only the nightly list carries Fedi Testnet, and it carries every
# production federation too
echo "FEDI_ENV=nightly" >>ui/native/.env

head_sha=$(git rev-parse HEAD)
base_sha=$(git merge-base "origin/$base_branch" HEAD)

fail_soft() {
    echo "::warning::sieve capture stopped early: $1"
    exit 0
}

section() { printf '\n===== %s =====\n' "$1"; }

# its own worktree: the side builds check the clone back and forth
start_devfed() {
    local src=$devfed_dir/src bin=${CAPTURE_DEVFED_BIN:-}
    git worktree add -q --detach "$src" "$base_sha" || return 1
    cd "$src" || return 1
    # cargo resolves the manifold crates through .nix-deps, which the dev
    # shell only links into its own checkout
    link-external-deps "$src" || return 1
    if [ -z "$bin" ]; then
        bin=$devfed_dir/bin
        # the payments e2e's cache key, so its runners already hold this build
        DEVFED_BIN_DIR=$bin ./scripts/ci/run-in-fs-dir-cache.sh e2e-devfed \
            ./scripts/bridge/build-remote.sh || return 1
    fi
    # REMOTE_BRIDGE_PORT exists only in the trailing command's environment,
    # and that command's exit is what shuts the fed down
    DEVFED_BIN_DIR=$bin ./scripts/bridge/launch-remote.sh --with-devfed --port 0 \
        bash -c 'echo "$REMOTE_BRIDGE_PORT" >"$1/port"; while [ ! -e "$1/done" ]; do sleep 2; done' _ "$devfed_dir"
}
section "start dev fed"
mkdir -p "$devfed_dir"
# set -m gives the fed its own process group for stop_devfed
set -m
start_devfed >"$devfed_dir/log" 2>&1 &
devfed_pid=$!
set +m
echo "dev fed building and booting in the background (pid $devfed_pid, log in $devfed_dir/log)"

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
export ANDROID_SERIAL="emulator-$emu_port"
echo "device: $ANDROID_SERIAL"

# a screencap with no framebuffer returns an error string, and a blank screen
# is still a png, so test the signature and not the size
is_png() { [ "$(head -c 8 | od -An -tx1 | tr -d ' \n')" = "89504e470d0a1a0a" ]; }

# quickboot's file-backed ram image segfaults qemu under the linux
# runner units
boot_once() {
    emulator -avd "$avd" -port "$emu_port" \
        -no-snapshot -no-boot-anim -no-audio -no-window \
        -gpu swiftshader_indirect -accel auto \
        >"$workdir/emulator.log" 2>&1 &
    emu_pid=$!
    sleep 10
    timeout 180 adb wait-for-device || return 1
    for _ in $(seq 1 30); do
        if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
            # sys.boot_completed says nothing about the framebuffer
            adb exec-out screencap -p >"$workdir/boot-check.png"
            is_png <"$workdir/boot-check.png" && return 0
            echo "::warning::emulator booted with no framebuffer"
            return 1
        fi
        sleep 10
    done
    return 1
}

# the first boot of a new avd on the linux runners can fail or come up with
# no framebuffer, and a second boot of the same avd is reliable
booted=false
for attempt in 1 2 3; do
    if boot_once; then
        booted=true
        break
    fi
    echo "::warning::emulator boot attempt $attempt failed"
    cat "$workdir/emulator.log" || true
    kill "$emu_pid" 2>/dev/null
    sleep 5
done
if [ "$booted" != "true" ]; then
    emulator -accel-check 2>&1 || true
    ls -l /dev/kvm 2>&1 || true
    fail_soft "emulator never booted"
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
# text equals the key, or fails. A node clipped by the screen edge reports
# inverted bounds and counts as not found, so the caller scrolls.
find_key() {
    local key=$1 xml node
    xml=$(dump_ui)
    node=$(grep -oE "<node[^>]*(content-desc=\"$key\"|resource-id=\"$key\"|text=\"$key\")[^>]*>" <<<"$xml" | head -1)
    [ -n "$node" ] || return 1
    sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/' <<<"$node" |
        awk '{ if ($3 <= $1 || $4 <= $2) exit 1; printf "%d %d", ($1+$3)/2, ($2+$4)/2 }'
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
    echo "::warning::ui_tap: $key not found after ${timeout}s; visible keys were:"
    dump_ui | grep -oE '(content-desc|resource-id)="[^"]+"' | sort -u | head -40
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
    local side=$1 name=$2 bytes
    mkdir -p "$out_dir/$side"
    wait_idle
    adb exec-out screencap -p >"$out_dir/$side/$name.png"
    if ! is_png <"$out_dir/$side/$name.png"; then
        bytes=$(wc -c <"$out_dir/$side/$name.png" | tr -d ' ')
        echo "::warning::discarding $side/$name.png, not a png ($bytes bytes)"
        rm -f "$out_dir/$side/$name.png"
        return 0
    fi
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

    if ui_tap "WalletTabButton" 30 && ui_tap "${fed_key}DetailsButton" 20; then
        shoot "$side" "07b-federation-details"
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

key_text() {
    dump_ui | grep -oE "<node[^>]*resource-id=\"$1\"[^>]*>" | head -1 |
        sed -E 's/.* text="([^"]*)".*/\1/'
}

# the backup reminder pops a beat after the wallet renders, so a one-shot
# dismiss races it
wait_for_wallet() {
    local waited=0
    while [ "$waited" -lt 45 ]; do
        find_key "Receive" >/dev/null && return 0
        ui_tap "BackupReminderDismissButton" 3 >/dev/null 2>&1 || true
        waited=$((waited + 3))
    done
    return 1
}

# a cold build on a fresh runner can still be going when the first tour starts
devfed_port() {
    local waited=0
    while [ ! -s "$devfed_dir/port" ]; do
        if ! kill -0 "$devfed_pid" 2>/dev/null; then
            echo "::warning::the dev fed exited before it was ready; the funded stations are skipped" >&2
            tail -40 "$devfed_dir/log" >&2 || true
            return 1
        fi
        if [ "$waited" -ge 900 ]; then
            echo "::warning::the dev fed was not ready after ${waited}s; the funded stations are skipped" >&2
            return 1
        fi
        sleep 15
        waited=$((waited + 15))
    done
    cat "$devfed_dir/port"
}

# the overlay ignores BACK, and on older builds the card is one
# accessibility node, so the fallback taps the backdrop
close_history_detail() {
    ui_tap "HistoryDetailCloseButton" 10 >/dev/null 2>&1 || adb shell input tap 360 120
    sleep 1
}

# one deep link delivers the invite and the notes: adb has no clipboard
tour_funded() {
    local side=$1 port invite ecash p digit
    port=$(devfed_port) || return 0
    # the fed binds to the host loopback, which the emulator cannot see
    for p in $(curl -sf "http://127.0.0.1:$port/ports" | jq -r '.ports[]'); do
        adb reverse "tcp:$p" "tcp:$p" >/dev/null || return 0
    done
    invite=$(curl -sf "http://127.0.0.1:$port/invite_code" | jq -r '.invite_code // empty')
    ecash=$(curl -sf "http://127.0.0.1:$port/generate_ecash/$((fund_sats * 1000))" | jq -r '.ecash // empty')
    if [ -z "$invite" ] || [ -z "$ecash" ]; then
        echo "::warning::the dev fed gave no invite or ecash; the funded stations are skipped"
        return 0
    fi
    reanchor
    adb shell "am start -a android.intent.action.VIEW -d 'fedi://join-then-ecash?invite=$invite&ecash=$ecash' com.fedi" >/dev/null 2>&1
    wait_for_key "JoinFederationButton" 90 || return 0
    ui_tap "JoinFederationButton" 30 || return 0
    wait_for_key "claim-ecash-button" 120 || return 0
    shoot "$side" "11-claim-ecash"
    ui_tap "claim-ecash-button" 30 || return 0
    wait_for_key "Go to wallet" 120 || return 0
    shoot "$side" "12-ecash-claimed"
    ui_tap "Go to wallet" 30 || return 0
    wait_for_wallet || return 0
    shoot "$side" "13-wallet-funded"

    ui_tap "BalanceCard__TransactionHistory" 30 || return 0
    wait_for_key "transaction-item" 60 || return 0
    shoot "$side" "14-history"
    ui_tap "transaction-item" 15 || return 0
    shoot "$side" "15-history-detail-receive"
    close_history_detail
    ui_tap "HeaderBackButton" 15 || return 0
    wait_for_wallet || return 0

    ui_tap "Send" 30 || return 0
    ui_tap "ecashTab" 30 || return 0
    # the keypad starts in fiat on a fresh install
    for _ in 1 2 3; do
        case "$(key_text AmountInputLabel)" in *SATS*) break ;; esac
        ui_tap "AmountUnitSwitcher" 15 || return 0
    done
    for digit in $(sed 's/./& /g' <<<"$send_sats"); do
        ui_tap "NumpadButton-$digit" 15 || return 0
    done
    shoot "$side" "16-send-ecash-amount"
    ui_tap "Next" 15 || return 0
    wait_for_key "SendConfirmButton" 60 || return 0
    shoot "$side" "17-send-ecash-confirm"
    ui_tap "SendConfirmButton" 15 || return 0
    # the offline-send alert's positive button, by id rather than its label
    ui_tap "android:id/button1" 15 >/dev/null 2>&1 || true
    wait_for_key "Copy" 60 || return 0
    shoot "$side" "18-send-ecash-qr"
    ui_tap "HeaderCloseButton" 15 || return 0
    wait_for_wallet || return 0

    # newest first, so the top row is the send nobody has claimed
    ui_tap "BalanceCard__TransactionHistory" 30 || return 0
    ui_tap "transaction-item" 30 || return 0
    shoot "$side" "19-history-detail-send"
    close_history_detail
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
    ui_tap "${fed_key}JoinButton" 90 || return 0
    # the preview renders a loading placeholder until the federation
    # metadata arrives; shooting early diffs the two loading states
    wait_for_key "JoinFederationButton" 90 || true
    shoot "$side" "03-federation-preview"
    ui_tap "JoinFederationButton" 60 || return 0
    wait_for_key "HomeTabButton" 120 || return 0
    tour_stations "$side"
    tour_funded "$side"
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
    # each side installs from scratch, so the account screen's display name
    # and the qr of the user link differ on every run
    [ "$name" = "09-account" ] && continue
    # compare exits 1 on any difference. The crop drops the status bar (clock
    # and signal icons churn) from the 720x1280 frames this script's avd
    # produces.
    compare -metric AE "${before_png}[720x1220+0+60]" "${after_png}[720x1220+0+60]" \
        -highlight-color red "$out_dir/diff/$name.png" 2>/dev/null || true
    # what -metric AE prints varies by imagemagick build, so count the changed
    # pixels here: max across the channel differences, then threshold to 1
    pixels=$(magick "${before_png}[720x1220+0+60]" "${after_png}[720x1220+0+60]" \
        -compose difference -composite -separate -evaluate-sequence max \
        -threshold 0 -format '%[fx:mean*w*h]' info: 2>/dev/null)
    if [ -z "$pixels" ]; then
        echo "::warning::could not diff $name"
    else
        echo "$name: $(awk -v p="$pixels" 'BEGIN { print (p + 0 > 0) ? "changed" : "unchanged" }')" |
            tee -a "$manifest"
    fi
done

section "coverage"
# a missed station, or a file no station names, is a screen the review never saw
station_sources() {
    cat <<'EOF'
01-welcome screens/Splash
02-federation-list screens/PublicFederations|feature/federations/(FederationCompactTile|CommunityTile)
03-federation-preview screens/JoinFederation|feature/onboarding/FederationPreview|feature/federations/(JoinFederationHeader|FederationInviteHeader)
04-home screens/Home|feature/home/
05-chat screens/ChatScreen|feature/chat/
06-wallet screens/Wallet|feature/federations/BalanceCard|feature/wallet/
07-receive screens/Receive|feature/receive/
07b-federation-details screens/FederationDetails|feature/federations/FederationDetail
08-mods screens/Mods|feature/fedimods/
09-account screens/Settings|feature/settings/
10-app-settings screens/AppSettings|feature/settings/GeneralSettings
11-claim-ecash screens/ClaimEcash
12-ecash-claimed screens/ClaimEcash
13-wallet-funded screens/Wallet|feature/federations/BalanceCard|feature/backup/PersonalBackupReminder
14-history screens/Transactions|feature/transaction-history/
15-history-detail-receive feature/transaction-history/HistoryDetail|hooks/transactions|utils/transaction
16-send-ecash-amount screens/SendOfflineAmount|components/ui/(AmountInput|Numpad|InvisibleInput)|hooks/amount
17-send-ecash-confirm screens/ConfirmSendEcash|feature/send/(SendPreviewDetails|FeeBreakdown|SendAmounts)
18-send-ecash-qr screens/SendOfflineQr|feature/send/
19-history-detail-send feature/transaction-history/HistoryDetail|utils/transaction
EOF
}
coverage="$out_dir/coverage.txt"
: >"$coverage"
covered=0
changed=0
while IFS= read -r path; do
    changed=$((changed + 1))
    hits=""
    while read -r station pattern; do
        grep -qE "$pattern" <<<"$path" || continue
        if [ -f "$out_dir/before/$station.png" ] && [ -f "$out_dir/after/$station.png" ]; then
            hits="$hits $station:captured"
        else
            hits="$hits $station:missed"
        fi
    done < <(station_sources)
    case "$hits" in *:captured*) covered=$((covered + 1)) ;; esac
    echo "$path:${hits:- no station}" >>"$coverage"
done < <(jq -r '.files[].path' <<<"$pr" | grep -E '^ui/(native|common)/' | grep -vE '/tests?/')
echo "changed ui files photographed by a station: $covered of $changed" | tee -a "$coverage"
if [ "$covered" -eq 0 ] && [ "$changed" -gt 0 ]; then
    echo "::warning::the capture reached none of the screens this PR changes (see coverage.txt)"
fi

echo "capture complete: $(find "$out_dir" -name '*.png' | wc -l | tr -d ' ') images in $out_dir"
exit 0
