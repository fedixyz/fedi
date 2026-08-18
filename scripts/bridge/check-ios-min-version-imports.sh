#!/usr/bin/env bash
# Fail if the iOS bridge imports an Apple symbol newer than the deployment target.
# A strong import of a symbol the OS does not have makes dyld kill the app before
# main, on every launch, with no Fedi code involved.
#
# usage: check-ios-min-version-imports.sh <libfediffi.a> [denylist]
set -euo pipefail

lib="$1"
denylist="${2:-$(dirname "$0")/ios-min-version-import-denylist.txt}"

[ -f "$lib" ] || { echo "no such library: $lib" >&2; exit 2; }
[ -f "$denylist" ] || { echo "no such denylist: $denylist" >&2; exit 2; }

imports=$(nm -u "$lib" 2>/dev/null | awk '{print $NF}' | sort -u)
banned=$(grep -vE '^\s*(#|$)' "$denylist" | awk '{print $1}' | sort -u)

hits=$(comm -12 <(printf '%s\n' "$imports") <(printf '%s\n' "$banned") || true)

if [ -n "$hits" ]; then
  echo "iOS bridge imports symbols newer than the deployment target:" >&2
  while IFS= read -r sym; do
    note=$(grep -E "^\s*${sym}\b" "$denylist" | head -1 | cut -d' ' -f2- || true)
    echo "  $sym  ${note}" >&2
  done <<< "$hits"
  echo "see $denylist" >&2
  exit 1
fi

echo "ok: no imports newer than the deployment target in $(basename "$lib")"
