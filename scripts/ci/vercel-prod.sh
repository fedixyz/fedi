#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

WASM_BUILD_PROFILE=release $REPO_ROOT/scripts/ui/install-wasm.sh

# Pull Vercel Environment Information
vercel pull --yes --environment=production --token=$VERCEL_TOKEN

# Build Project Artifacts
vercel build --prod --token=$VERCEL_TOKEN

# Deploy Project Artifacts to Vercel
url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")
echo "url=$url" >> "$GITHUB_OUTPUT"
