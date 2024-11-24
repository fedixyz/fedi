#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

# Pull Vercel Environment Information
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"

# Deploy Project Artifacts to Vercel
url=$(vercel deploy --prod --token="$VERCEL_TOKEN" --cwd $REPO_ROOT/ui/apk)
echo "url=$url" >> "$GITHUB_OUTPUT"
