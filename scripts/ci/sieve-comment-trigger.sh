#!/usr/bin/env bash

set -euo pipefail

body=${COMMENT_BODY:-}

# The job `if` can only test for the letter sequence, so "pensieve" and
# "sieves" reach this script. Word boundaries are what stop them.
if grep -qiE '(^|[^[:alnum:]_])sieve([^[:alnum:]_]|$)' <<<"$body"; then
    echo "matched=true" >>"$GITHUB_OUTPUT"
    echo "Comment calls sieve; reviewing."
else
    echo "matched=false" >>"$GITHUB_OUTPUT"
    echo "Comment only contains sieve inside a longer word; nothing to do."
fi
