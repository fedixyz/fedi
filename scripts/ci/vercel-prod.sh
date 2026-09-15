#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

ref=${GITHUB_REF_NAME:-}
if [[ ! $ref =~ ^web/[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "vercel-prod expects a web/X.Y.Z tag, got '${ref:-no ref}'" >&2
    exit 1
fi
version=${ref#web/}
packaged=$(node -p "require('$REPO_ROOT/ui/web/package.json').version")
if [[ $packaged != "$version" ]]; then
    echo "ui/web/package.json says $packaged, tag says $version" >&2
    exit 1
fi

WASM_BUILD_PROFILE=release $REPO_ROOT/scripts/ui/install-wasm.sh

# Pull Vercel Environment Information
vercel pull --yes --environment=production --token=$VERCEL_TOKEN

# Build Project Artifacts
vercel build --prod --token=$VERCEL_TOKEN

# Deploy Project Artifacts to Vercel
url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")
echo "url=$url" >> "$GITHUB_OUTPUT"

if ! curl -fsS --retry 5 --retry-delay 3 --retry-all-errors "$url/api/version" \
    | grep -qF "\"version\":\"$version\""; then
    echo "deployment at $url does not report version $version" >&2
    exit 1
fi
