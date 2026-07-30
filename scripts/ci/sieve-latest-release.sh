#!/usr/bin/env bash
set -euo pipefail

# Pushing a version tag is what deploys the sieve server, so the newest release
# tag is the schema live at SIEVE_HOST.
tag="$(gh release view --repo fedibtc/sieve --json tagName --jq .tagName)"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo "::error::Refusing to build the sieve CLI from '$tag', which is not a version tag."
    exit 1
fi

echo "rev=$tag"
