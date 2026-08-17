#!/usr/bin/env bash
#
# Dispatches the sieve hub review workflow for every open PR that is ready
# for review and whose head has not been reviewed yet, so the reviewed repos
# add no workflow files and hold no secrets. `sieve review-pr` stamps the
# reviewed head sha into each PR's sticky comment; that stamp is the only
# state, so an unchanged PR is skipped and a push gets a fresh review.
#
# Env:
#   GH_TOKEN         cross-repo credential (GitHub App installation token or
#                    PAT) that can read the org's repos and PR comments
#   DISPATCH_TOKEN   token with actions:write on the hub repo, used only to
#                    dispatch sieve-hub-review.yml
#   SWEEP_REPOS      space-separated owner/name list; empty sweeps every
#                    non-archived non-fork repo in the org
#   MAX_AGE_HOURS    how recently a PR must have become reviewable (default 24)

set -euo pipefail

ORG=fedibtc
HUB_REPO=fedibtc/fedi
max_age_hours=${MAX_AGE_HOURS:-24}

if [ -z "${GH_TOKEN:-}" ]; then
    echo "::error::no cross-repo credential: set the SIEVE_HUB_APP_ID variable + SIEVE_HUB_APP_PRIVATE_KEY secret, or the SIEVE_HUB_TOKEN secret"
    exit 1
fi
if [ -z "${DISPATCH_TOKEN:-}" ]; then
    echo "::error::DISPATCH_TOKEN is not set"
    exit 1
fi

if [ -n "${SWEEP_REPOS:-}" ]; then
    repos=$SWEEP_REPOS
else
    # Archived repos cannot take comments and fork repos are not ours.
    repos=$(gh api "orgs/$ORG/repos" --paginate \
        --jq '.[] | select((.archived or .fork) | not) | .full_name')
fi

cutoff=$(date -u -d "$max_age_hours hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null ||
    date -u -v-"${max_age_hours}"H +%Y-%m-%dT%H:%M:%SZ)
echo "Reviewing PRs that became reviewable since $cutoff"

# the github api returns transient 5xx, and a 15-minute cron amplifies it
gh_retry() {
    local out attempt=1
    while true; do
        if out=$(gh "$@"); then
            printf '%s' "$out"
            return 0
        fi
        if [ "$attempt" -ge 3 ]; then
            return 1
        fi
        sleep $((attempt * 5))
        attempt=$((attempt + 1))
    done
}

# a PR with no checks at all is not ready: nothing has vouched for the code
# shellcheck disable=SC2016  # $runs and $ctx are jq bindings, not shell
ready_filter='
    [.statusCheckRollup[]? | select(.__typename == "CheckRun")] as $runs
    | [.statusCheckRollup[]? | select(.__typename == "StatusContext")] as $ctx
    | (($runs | length) + ($ctx | length)) as $total
    | if $total == 0 then false
      elif ($runs | map(select(.status != "COMPLETED")) | length) > 0 then false
      elif ($runs | map(select(.conclusion | IN("SUCCESS", "NEUTRAL", "SKIPPED") | not)) | length) > 0 then false
      elif ($ctx | map(select(.state != "SUCCESS")) | length) > 0 then false
      else true
      end'
# A StatusContext has no completion time, so its start stands in for one.
green_at_filter='
    [(.statusCheckRollup[]? | select(.__typename == "CheckRun") | .completedAt),
     (.statusCheckRollup[]? | select(.__typename == "StatusContext") | .startedAt)]
    | map(select(. != null)) | max // ""'

failures=()
dispatched=0
skipped_reviewed=0
skipped_not_ready=0
skipped_stale=0

for repo in $repos; do
    # A failing repo must not starve the ones after it: the same repo would
    # fail at the same point every sweep. Checks are fetched per PR below:
    # asking for them here makes the query heavy enough to time out.
    if ! prs=$(gh_retry pr list --repo "$repo" --state open --limit 200 \
        --json number,isDraft,isCrossRepository,headRefOid,changedFiles \
        --jq '.[] | @json'); then
        failures+=("$repo (pr list)")
        continue
    fi
    while IFS= read -r pr; do
        [ -z "$pr" ] && continue
        # The hub refuses fork PRs; drafts are not ready for review.
        if [ "$(jq -r '.isDraft or .isCrossRepository' <<<"$pr")" = "true" ]; then
            continue
        fi
        # An empty-diff PR gets no review and no head stamp (review-pr
        # skips it), so it would be re-dispatched every sweep forever.
        if [ "$(jq -r '.changedFiles == 0' <<<"$pr")" = "true" ]; then
            continue
        fi
        number=$(jq -r '.number' <<<"$pr")
        # A checks fetch that fails must not look like a green PR.
        if ! checks=$(gh_retry pr view "$number" --repo "$repo" --json statusCheckRollup); then
            failures+=("$repo#$number (checks)")
            continue
        fi
        if [ "$(jq -r "$ready_filter" <<<"$checks")" != "true" ]; then
            skipped_not_ready=$((skipped_not_ready + 1))
            continue
        fi
        # without a window the first sweep of a repo reviews its whole backlog
        reviewable_at=$(jq -r "$green_at_filter" <<<"$checks")
        # marking a draft ready reruns no checks, so its green stamp predates it
        if [[ "$reviewable_at" < "$cutoff" ]]; then
            ready_at=$(gh_retry api "repos/$repo/issues/$number/timeline" --paginate \
                --jq '[.[] | select(.event == "ready_for_review") | .created_at] | max // ""' || true)
            if [[ -n "$ready_at" && "$ready_at" > "$reviewable_at" ]]; then
                reviewable_at=$ready_at
            fi
        fi
        if [[ "$reviewable_at" < "$cutoff" ]]; then
            skipped_stale=$((skipped_stale + 1))
            continue
        fi
        head=$(jq -r '.headRefOid' <<<"$pr")
        # `sieve review-pr` stamps the reviewed sha into the sticky comment.
        # A failed fetch dispatches a duplicate review, which is harmless.
        comments=$(gh_retry api "repos/$repo/issues/$number/comments" --paginate \
            --jq '.[].body' || true)
        case "$comments" in
        *"sieve-head:$head"*)
            skipped_reviewed=$((skipped_reviewed + 1))
            continue
            ;;
        esac
        echo "Dispatching review for $repo#$number (${head:0:12}, reviewable since $reviewable_at)"
        if GH_TOKEN=$DISPATCH_TOKEN gh workflow run sieve-hub-review.yml \
            --repo "$HUB_REPO" -f "repo=$repo" -f "pr_number=$number"; then
            dispatched=$((dispatched + 1))
        else
            failures+=("$repo#$number (dispatch)")
        fi
    done <<<"$prs"
done

echo "Dispatched $dispatched review(s); skipped $skipped_reviewed already reviewed, $skipped_not_ready not green, $skipped_stale reviewable before the cutoff"
if [ ${#failures[@]} -gt 0 ]; then
    echo "::error::sweep failed for: ${failures[*]}"
    exit 1
fi
