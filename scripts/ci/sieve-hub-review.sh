#!/usr/bin/env bash
#
# Reviews one PR, in four steps:
#
#   1. stop on a comment that says sieve only inside a longer word
#   2. resolve the sieve release deployed at SIEVE_HOST
#   3. capture emulator screenshots for the agent, best effort
#   4. publish the review with that release's CLI
#
# Env:
#   REPO, PR_NUMBER   the PR to review
#   COMMENT_BODY      set only when a comment triggered the run
#   GH_TOKEN          cross-repo read
#   SIEVE_TOKEN       publishes to SIEVE_HOST
#   ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN, else the review is a
#   mechanical recap of the diff

set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
repo=${REPO:?REPO (owner/name) is required}
number=${PR_NUMBER:?PR_NUMBER is required}
export REPO=$repo PR_NUMBER=$number

# the job `if` can only test for the letter sequence, so "pensieve" and
# "sieves" reach here. Word boundaries are what stop them.
if [ -n "${COMMENT_BODY:-}" ] &&
    ! grep -qiE '(^|[^[:alnum:]_])sieve([^[:alnum:]_]|$)' <<<"$COMMENT_BODY"; then
    echo "the comment says sieve only inside a longer word; nothing to review"
    exit 0
fi

# pushing a version tag is what deploys the sieve server, so the newest
# release tag is the schema live at SIEVE_HOST
rev=$(nix shell nixpkgs#gh --command gh release view --repo fedibtc/sieve --json tagName --jq .tagName)
if [[ ! $rev =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo "::error::refusing to build the sieve CLI from '$rev', which is not a version tag"
    exit 1
fi
echo "reviewing $repo#$number with sieve $rev"
# the comment step builds the same CLI
echo "rev=$rev" >>"${GITHUB_OUTPUT:-/dev/null}"

screenshots=$PWD/sieve-screenshots
export OUT_DIR=$screenshots SIEVE_SCREENSHOTS_DIR=$screenshots
# the dev shell carries the emulator and app toolchain, and a capture
# failure must never cost the review itself
echo '::group::capture'
nix develop -c nix shell nixpkgs#gh nixpkgs#jq nixpkgs#imagemagick \
    --command "$script_dir/sieve-hub-capture.sh" ||
    echo "::warning::screenshot capture failed, so this review carries no images"
echo '::endgroup::'

# the generic linux sieve binary does not run on NixOS, and claude-code is
# unfree, which nix only honors on an impure eval
NIXPKGS_ALLOW_UNFREE=1 nix shell --impure "github:fedibtc/sieve/${rev}#sieve" \
    nixpkgs#claude-code nixpkgs#gh nixpkgs#jq nixpkgs#git \
    --command "$script_dir/sieve-hub-publish.sh"
