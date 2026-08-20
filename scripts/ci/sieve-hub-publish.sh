#!/usr/bin/env bash
#
# Publishes the sieve review for one PR, then hands its checkout to the
# comment step. Runs inside the nix shell that sieve-hub-review.sh builds
# from the deployed sieve release.

set -euo pipefail

# bare https clones don't read GH_TOKEN; gh supplies it. The empty
# helper entry keeps a 401 off the OS keychain prompt, which hangs headless.
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/usr/bin/true
export GIT_CONFIG_COUNT=2 \
    GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0='' \
    GIT_CONFIG_KEY_1=credential.https://github.com.helper GIT_CONFIG_VALUE_1='!gh auth git-credential'

repo=${REPO:?REPO (owner/name) is required}
number=${PR_NUMBER:?PR_NUMBER is required}

script_dir=$(cd "$(dirname "$0")" && pwd)
# A cheaper model regresses this to the recap the agent path exists to replace.
agent_model=${SIEVE_AGENT_MODEL:-claude-opus-5}

if [ -z "${GH_TOKEN:-}" ]; then
    echo "::error::GH_TOKEN is required"
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
workdir=$(mktemp -d "${TMPDIR:-/tmp}/sieve-review.XXXXXX")
find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'sieve-review.*' -not -path "$workdir" -mmin +180 -exec rm -rf {} + 2>/dev/null || true
# the comment step runs in this checkout, so a published review keeps it
keep_workdir=0
trap '[ "$keep_workdir" = 1 ] || rm -rf "$workdir"' EXIT
# bash skips EXIT traps on unhandled signals
trap 'exit 129' HUP INT TERM
# referenced by sieve-hub-agent-review.md
export SIEVE_AGENT_SCRATCH="$workdir/scratch"
mkdir -p "$SIEVE_AGENT_SCRATCH"
# `review-pr` needs authenticated base fetches for private repos.
git clone --quiet --branch "$branch" \
    "https://x-access-token:${GH_TOKEN}@github.com/${repo}.git" "$workdir/repo"
cd "$workdir/repo"

# the agent prompt looks for screenshots/ by that exact name
if [ -n "${SIEVE_SCREENSHOTS_DIR:-}" ] && [ -d "$SIEVE_SCREENSHOTS_DIR" ]; then
    cp -R "$SIEVE_SCREENSHOTS_DIR" screenshots
    echo "imported $(find screenshots -name '*.png' | wc -l | tr -d ' ') captured screenshots"
fi

# the comment posts from a later step under an app token: installation
# tokens expire after an hour and this job routinely runs longer
hand_off_comment() {
    local review_id url
    review_id=$(jq -r '.review.id' <<<"$1")
    url=$(jq -r '.url' <<<"$1")
    echo "::notice::published $url"
    echo "[sieve review for $repo#$number]($url)" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
    if [ -z "${GITHUB_OUTPUT:-}" ]; then
        sieve --host "$SIEVE_HOST" pr-comment "$review_id"
        return
    fi
    {
        echo "review_id=$review_id"
        echo "workdir=$workdir"
    } >>"$GITHUB_OUTPUT"
    keep_workdir=1
}

# A stale API key must not shadow a working subscription token.
if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    unset ANTHROPIC_API_KEY
fi

recap=sieve-recap.json
scaffold=$(sieve --json --host "$SIEVE_HOST" review-pr --manifest-out "$recap")
if [ "$(jq -r '.skipped // false' <<<"$scaffold")" = "true" ]; then
    jq -r '.reason' <<<"$scaffold"
    exit 0
fi

# a bare `review-pr` publishes and comments in one shot, from this step
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
    echo "::warning::neither ANTHROPIC_API_KEY nor CLAUDE_CODE_OAUTH_TOKEN is set, so this review is a mechanical recap of the diff and carries no judgment"
    published=$(sieve --json --host "$SIEVE_HOST" publish --manifest "$recap" --redact)
    hand_off_comment "$published"
    exit 0
fi

# publishing reuses "<repo>#<branch>" as the idempotency key, so that is how
# the prior version is found. No prior review is the common case, so a miss
# here must not cost the review.
# referenced by sieve-hub-agent-review.md
feedback=sieve-prior-feedback.json
prior=$(sieve --json --host "$SIEVE_HOST" list --repo "$repo" 2>/dev/null |
    jq -r --arg key "$repo#$branch" 'first(.reviews[]? | select(.idempotencyKey == $key) | .id) // empty') || prior=""
if [ -n "$prior" ] && sieve --json --host "$SIEVE_HOST" feedback "$prior" >"$feedback" 2>/dev/null; then
    echo "prior review $prior carries $(jq '[.actionableThreads[]?, .fyiThreads[]?, .resolvedThreads[]?] | length' "$feedback") human thread(s)"
else
    rm -f "$feedback"
fi

prompt="$script_dir/sieve-hub-agent-review.md"
trace="$workdir/agent-trace.jsonl"
# the workflow builds the CLI from the newest sieve release, so this runs
# against releases that predate run records
trace_args=()
if sieve publish --help 2>/dev/null | grep -q -- '--trace'; then
    trace_args=(--trace "$trace" --trace-prompt "$prompt")
else
    echo "::warning::sieve $(sieve --version) has no run records, so this review publishes without one"
fi

# --print alone is silent until the agent exits
claude --print --verbose --output-format stream-json --model "$agent_model" \
    --allowed-tools Read Grep Glob Edit Write "Bash(git:*)" "Bash(jq:*)" "Bash(sieve:*)" \
    <"$prompt" \
    | tee "$trace" \
    | jq --unbuffered -rj 'if .type == "assistant" then ([.message.content[]? | if .type == "tool_use" then "agent> \(.name) \((.input.command // .input.file_path // .input.pattern // "") | tostring | .[0:200])\n" elif .type == "text" then "agent: \(.text)\n" else empty end] | join("")) elif .type == "result" then "agent finished: \(.subtype)\n" else empty end'

# A no-op agent still leaves the scaffold behind, and the scaffold publishes fine.
if [ "$(jq -r '.origin' "$recap")" != "authored" ]; then
    # publish records the run, and this path never reaches publish
    if [ ${#trace_args[@]} -gt 0 ]; then
        sieve --host "$SIEVE_HOST" run record "${trace_args[@]}" \
            --repo "$repo" --branch "$branch" --outcome failed || true
    fi
    echo "::error::the agent left the recap mechanical, so there is no review to publish"
    exit 1
fi

published=$(sieve --json --host "$SIEVE_HOST" publish --manifest "$recap" --redact \
    "${trace_args[@]+"${trace_args[@]}"}")
hand_off_comment "$published"
