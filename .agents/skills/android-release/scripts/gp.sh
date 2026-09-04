#!/usr/bin/env bash
# Google Play publishing API client. Trades a service account json for an
# access token and curls the endpoint.
# usage: gp.sh <path-under-/androidpublisher/v3/applications | full url> [curl args...]
# env: GP_CREDS - path to the service account json (see the android-release SKILL.md)
set -euo pipefail
CRED="${GP_CREDS:-}"
if [[ -z "$CRED" || ! -f "$CRED" ]]; then
    echo 'set GP_CREDS to a Play service account json; see .agents/skills/android-release/SKILL.md' >&2
    exit 1
fi
EMAIL=$(python3 -c "import json;print(json.load(open('$CRED'))['client_email'])")
TOKEN_URI=$(python3 -c "import json;print(json.load(open('$CRED'))['token_uri'])")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
python3 -c "import json;print(json.load(open('$CRED'))['private_key'])" >"$tmp/key.pem"
b64() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
exp=$((now + 3540))
hdr=$(printf '{"alg":"RS256","typ":"JWT"}' | b64)
pl=$(printf '{"iss":"%s","scope":"https://www.googleapis.com/auth/androidpublisher","aud":"%s","iat":%d,"exp":%d}' "$EMAIL" "$TOKEN_URI" "$now" "$exp" | b64)
sig=$(printf '%s.%s' "$hdr" "$pl" | openssl dgst -sha256 -sign "$tmp/key.pem" -binary | b64)
tok=$(curl -sS -X POST "$TOKEN_URI" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=$hdr.$pl.$sig" |
    python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('access_token') or exit(d.get('error_description', 'token request failed')))")
path="$1"
shift
case "$path" in
http*) url="$path" ;;
*) url="https://androidpublisher.googleapis.com/androidpublisher/v3/applications/$path" ;;
esac
curl -sS -g -H "Authorization: Bearer $tok" "$@" "$url"
