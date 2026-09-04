#!/usr/bin/env bash
# App Store Connect API client. Mints an ES256 JWT from an ASC key json
# ({key_id, issuer_id, key}) and curls the endpoint.
# usage: asc.sh <path-under-/v1 | full url> [curl args...]
# env: ASC_CREDS - path to the key json (see the ios-release SKILL.md for setup)
set -euo pipefail
CRED="${ASC_CREDS:-}"
if [[ -z "$CRED" || ! -f "$CRED" ]]; then
    echo 'set ASC_CREDS to a key json {key_id, issuer_id, key}; see .agents/skills/ios-release/SKILL.md' >&2
    exit 1
fi
KID=$(python3 -c "import json;print(json.load(open('$CRED'))['key_id'])")
ISS=$(python3 -c "import json;print(json.load(open('$CRED'))['issuer_id'])")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
python3 -c "import json;print(json.load(open('$CRED'))['key'])" >"$tmp/key.p8"
b64() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
exp=$((now + 1140))
hdr=$(printf '{"alg":"ES256","kid":"%s","typ":"JWT"}' "$KID" | b64)
pl=$(printf '{"iss":"%s","iat":%d,"exp":%d,"aud":"appstoreconnect-v1"}' "$ISS" "$now" "$exp" | b64)
# openssl emits a DER signature; JWT wants raw r||s
ints=$(printf '%s.%s' "$hdr" "$pl" | openssl dgst -sha256 -sign "$tmp/key.p8" -binary | openssl asn1parse -inform DER 2>/dev/null | awk -F: '/INTEGER/{print $4}')
r=$(printf '%064s' "$(echo "$ints" | sed -n 1p)" | tr ' ' 0 | tail -c 64)
s=$(printf '%064s' "$(echo "$ints" | sed -n 2p)" | tr ' ' 0 | tail -c 64)
sig=$(printf '%s%s' "$r" "$s" | xxd -r -p | b64)
path="$1"
shift
case "$path" in
http*) url="$path" ;;
*) url="https://api.appstoreconnect.apple.com/v1/$path" ;;
esac
curl -sS -g -H "Authorization: Bearer $hdr.$pl.$sig" "$@" "$url"
