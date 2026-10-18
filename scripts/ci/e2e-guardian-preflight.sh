#!/usr/bin/env bash
# Joins every federation on the app's public list with a throwaway
# fedimint-cli and logs how long each guardian took to answer from this runner.
#
# Usage: ./scripts/ci/e2e-guardian-preflight.sh <label>

set -uo pipefail

REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel)}"
E2E_LOG_DIR="${E2E_LOG_DIR:-$REPO_ROOT/ui/.appium/pipeline}"
DEVFED_BIN_DIR="${DEVFED_BIN_DIR:-$E2E_LOG_DIR/devfed-bin}"
FEDERATIONS_URL="${E2E_FEDERATIONS_URL:-https://fedi-ashen.vercel.app/api/federations}"
JOIN_TIMEOUT="${E2E_GUARDIAN_TIMEOUT:-30}"

label="${1:-preflight}"
log="$E2E_LOG_DIR/guardians.log"
cli="$DEVFED_BIN_DIR/fedimint-cli"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$E2E_LOG_DIR"
section="$work/section"

probe() {
    local name="$1" code="$2"
    local url start elapsed rc reason
    url=$("$cli" dev decode invite-code "$code" 2>/dev/null | sed -n 's/.*"url": "\([^"]*\)".*/\1/p')
    if [ -z "$url" ]; then
        echo "skip | $name | invite code does not decode"
        return
    fi
    start=$(date +%s)
    RUST_LOG=error timeout "$JOIN_TIMEOUT" "$cli" --data-dir "$work/$name" join-federation "$code" >"$work/$name.out" 2>&1
    rc=$?
    elapsed=$(($(date +%s) - start))
    if [ "$rc" = 0 ]; then
        echo "ok   | $name | $url | ${elapsed}s"
    elif [ "$rc" = 124 ]; then
        echo "FAIL | $name | $url | no answer within ${JOIN_TIMEOUT}s"
    else
        reason=$(sed 's/\x1b\[[0-9;]*m//g' "$work/$name.out" | grep -v -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' | tail -1 | cut -c1-200)
        echo "FAIL | $name | $url | ${elapsed}s | exit $rc | $reason"
    fi
}

{
    echo "== $label at $(date -u +%FT%TZ) from ${RUNNER_NAME:-$(hostname)}"
    curl -sS --max-time 15 -o "$work/federations.json" \
        -w "list | $FEDERATIONS_URL | http %{http_code} | %{time_total}s\n" \
        "$FEDERATIONS_URL" 2>&1
} >"$section"

if [ ! -x "$cli" ]; then
    echo "fedimint-cli not built at $cli, guardians not probed" >>"$section"
elif [ -s "$work/federations.json" ]; then
    while IFS=$'\t' read -r name code; do
        probe "$name" "$code" >>"$section" &
    done < <(node -e '
        const list = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
        for (const f of Object.values(list)) console.log(`${f.federation_name}\t${f.invite_code}`)
    ' "$work/federations.json")
    wait
fi

{
    cat "$section"
    echo ""
} >>"$log"

ok=$(grep -c '^ok ' "$section")
failed=$(grep '^FAIL' "$section" | cut -d'|' -f2 | sed 's/^ //; s/ $//' | paste -sd '|' - | sed 's/|/, /g')
echo "🌐 Guardians ($label): $ok answered${failed:+, no answer from $failed}, details in ${log#"$REPO_ROOT"/}"
