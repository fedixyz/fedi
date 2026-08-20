#!/usr/bin/env bash
#
# Upserts the sticky Sieve comment on the PR the previous step reviewed.
#
# It runs as its own step so GH_TOKEN can be a GitHub App installation token
# minted moments earlier, which posts the comment as fedi-sieve rather than as
# a person. That token lives an hour and the review step alone regularly runs
# longer, so the mint has to happen after it.
#
# Env:
#   SIEVE_HOST               the sieve deployment the review was published to
#   SIEVE_REV                release the review published under
#   SIEVE_REVIEW_ID          review id the review step published
#   SIEVE_WORKDIR            the review step's checkout, which `pr-comment`
#                            reads the repo, branch, and head sha from
#   GH_TOKEN                 credential the comment posts under
#   SIEVE_FALLBACK_GH_TOKEN  credential to retry under, for a repo the app is
#                            not installed on
#   SIEVE_TOKEN              reads the review back to build the comment body

set -euo pipefail

review_id=${SIEVE_REVIEW_ID:?SIEVE_REVIEW_ID is required}
workdir=${SIEVE_WORKDIR:?SIEVE_WORKDIR is required}
rev=${SIEVE_REV:?SIEVE_REV is required}

# the CLI shells out to gh and git, so they ride in the same shell
sieve=(nix shell "github:fedibtc/sieve/${rev}#sieve" nixpkgs#gh nixpkgs#git
    --command sieve --host "$SIEVE_HOST")

# the review step keeps this directory alive only for this command
trap 'rm -rf "$workdir"' EXIT

if [ ! -d "$workdir/repo" ]; then
    echo "::error::$workdir/repo is gone, so there is no checkout to comment from"
    exit 1
fi

cd "$workdir/repo"

if "${sieve[@]}" pr-comment "$review_id"; then
    exit 0
fi

# this comment carries the only record that the head was reviewed, so losing
# it makes the sweep re-review the PR every half hour
if [ -z "${SIEVE_FALLBACK_GH_TOKEN:-}" ] || [ "${SIEVE_FALLBACK_GH_TOKEN}" = "${GH_TOKEN:-}" ]; then
    echo "::error::the sticky comment failed and there is no second credential to try"
    exit 1
fi
echo "::warning::the app could not post the sticky comment, so it posts under the fallback credential; check that fedi-sieve is installed on this repo and can edit the comment already there"
GH_TOKEN=$SIEVE_FALLBACK_GH_TOKEN "${sieve[@]}" pr-comment "$review_id"
