#!/usr/bin/env bash

set -euo pipefail

repo=${1:?usage: sieve-hub-review.sh <owner/repo> <pr-number>}
number=${2:?usage: sieve-hub-review.sh <owner/repo> <pr-number>}

if [ -z "${GH_TOKEN:-}" ]; then
    echo "::error::no cross-repo credential: set the SIEVE_HUB_APP_ID variable + SIEVE_HUB_APP_PRIVATE_KEY secret, or the SIEVE_HUB_TOKEN secret"
    exit 1
fi
if [ -z "${SIEVE_TOKEN:-}" ]; then
    echo "::error::SIEVE_TOKEN secret is not set (mint one at $SIEVE_HOST/settings/tokens)"
    exit 1
fi

sieve --version

pr=$(gh pr view "$number" --repo "$repo" --json state,headRefName,headRefOid,isCrossRepository)
branch=$(jq -r '.headRefName' <<<"$pr")
head=$(jq -r '.headRefOid' <<<"$pr")
if [ "$(jq -r '.state' <<<"$pr")" != "OPEN" ]; then
    echo "$repo#$number is not open; nothing to review"
    exit 0
fi
if [ "$(jq -r '.isCrossRepository' <<<"$pr")" = "true" ]; then
    echo "::error::$repo#$number is a fork PR; the hub only reviews branches the org owns"
    exit 1
fi

echo "Reviewing $repo#$number ($branch @ ${head:0:12})"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
# `review-pr` needs authenticated base fetches for private repos.
git clone --quiet --branch "$branch" \
    "https://x-access-token:${GH_TOKEN}@github.com/${repo}.git" "$workdir/repo"
(cd "$workdir/repo" && sieve --host "$SIEVE_HOST" review-pr)
