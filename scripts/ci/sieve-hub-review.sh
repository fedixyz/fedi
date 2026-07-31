#!/usr/bin/env bash

set -euo pipefail

repo=${1:?usage: sieve-hub-review.sh <owner/repo> <pr-number>}
number=${2:?usage: sieve-hub-review.sh <owner/repo> <pr-number>}

script_dir=$(cd "$(dirname "$0")" && pwd)
# A cheaper model regresses this to the recap the agent path exists to replace.
agent_model=${SIEVE_AGENT_MODEL:-claude-opus-5}

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
cd "$workdir/repo"

# A stale API key must not shadow a working subscription token.
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    unset ANTHROPIC_API_KEY
fi
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    echo "::warning::neither ANTHROPIC_API_KEY nor CLAUDE_CODE_OAUTH_TOKEN is set, so this review is a mechanical recap of the diff and carries no judgment"
    sieve --host "$SIEVE_HOST" review-pr
    exit 0
fi

recap=sieve-recap.json
scaffold=$(sieve --json --host "$SIEVE_HOST" review-pr --manifest-out "$recap")
if [ "$(jq -r '.skipped // false' <<<"$scaffold")" = "true" ]; then
    jq -r '.reason' <<<"$scaffold"
    exit 0
fi

claude --print --model "$agent_model" \
    --allowed-tools Read Grep Glob Edit Write "Bash(git:*)" "Bash(jq:*)" "Bash(sieve:*)" \
    <"$script_dir/sieve-hub-agent-review.md"

# A no-op agent still leaves the scaffold behind, and the scaffold publishes fine.
if [ "$(jq -r '.origin' "$recap")" != "authored" ]; then
    echo "::error::the agent left the recap mechanical, so there is no review to publish"
    exit 1
fi

published=$(sieve --json --host "$SIEVE_HOST" publish --manifest "$recap" --redact)
echo "Published $(jq -r '.url' <<<"$published")"
sieve --host "$SIEVE_HOST" pr-comment "$(jq -r '.review.id' <<<"$published")"
