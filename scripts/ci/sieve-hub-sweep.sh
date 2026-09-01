#!/usr/bin/env bash
#
# Dispatches the sieve hub review workflow for every open PR that is ready
# for review and whose head has not been reviewed yet, so the reviewed repos
# add no workflow files and hold no secrets. `sieve review-pr` stamps the
# reviewed head sha into each PR's sticky comment; that stamp is the only
# state, so an unchanged PR is skipped and a push gets a fresh review.
#
# A second pass picks up PRs that already merged, because a PR that opens,
# goes green, and merges between two ticks is never open when this runs and
# would otherwise ship unreviewed.
#
# Env:
#   GH_TOKEN         cross-repo credential (GitHub App installation token or
#                    PAT) that can read the org's repos and PR comments
#   DISPATCH_TOKEN   token with actions:write on the hub repo, used only to
#                    dispatch sieve-hub-review.yml
#   SWEEP_REPOS      space-separated owner/name list; empty sweeps every
#                    non-archived non-fork repo in the org
#   MAX_AGE_HOURS    how recently a PR must have become reviewable (default 24)
#   MERGED_MAX_AGE_HOURS
#                    how recently a PR must have merged for the merged pass
#                    to review it (default 3)

set -euo pipefail

ORG=fedibtc
HUB_REPO=fedibtc/fedi
max_age_hours=${MAX_AGE_HOURS:-24}
# Deliberately much shorter than the open window. This one reaches back over
# PRs that already merged, so widening it walks into a backlog and dispatches
# a deluge of reviews nobody asked for.
merged_max_age_hours=${MERGED_MAX_AGE_HOURS:-3}

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

iso_hours_ago() {
    date -u -d "$1 hours ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null ||
        date -u -v-"$1"H +%Y-%m-%dT%H:%M:%SZ
}
cutoff=$(iso_hours_ago "$max_age_hours")
merged_cutoff=$(iso_hours_ago "$merged_max_age_hours")
echo "Reviewing PRs that became reviewable since $cutoff, and PRs merged since $merged_cutoff"

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
# A StatusContext has no completion time, so when it was posted stands in.
green_at_filter='
    [(.statusCheckRollup[]? | select(.__typename == "CheckRun") | .completedAt),
     (.statusCheckRollup[]? | select(.__typename == "StatusContext") | .createdAt)]
    | map(select(. != null)) | max // ""'

# gh pr view's rollup query also asks for each check's workflow run, which
# needs an actions grant the cross-repo app does not carry
# shellcheck disable=SC2016  # $owner and friends are graphql variables
checks_query='
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun { status conclusion completedAt }
                  ... on StatusContext { state createdAt }
                }
              }
            }
          }
        }
      }
    }
  }
}'
# shellcheck disable=SC2016  # jq path, not shell
checks_shape='{statusCheckRollup:
    [.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[]?]}'

failures=()
dispatched=0
skipped_reviewed=0
skipped_not_ready=0
skipped_stale=0

# Dispatches a review unless this exact head was already reviewed.
dispatch_review() {
    local repo=$1 number=$2 head=$3 why=$4 comments
    # `sieve review-pr` stamps the reviewed sha into the sticky comment.
    # A failed fetch dispatches a duplicate review, which is harmless.
    comments=$(gh_retry api "repos/$repo/issues/$number/comments" --paginate \
        --jq '.[].body' || true)
    case "$comments" in
    *"sieve-head:$head"*)
        skipped_reviewed=$((skipped_reviewed + 1))
        return 0
        ;;
    esac
    echo "Dispatching review for $repo#$number (${head:0:12}, $why)"
    if GH_TOKEN=$DISPATCH_TOKEN gh workflow run sieve-hub-review.yml \
        --repo "$HUB_REPO" -f "repo=$repo" -f "pr_number=$number"; then
        dispatched=$((dispatched + 1))
    else
        failures+=("$repo#$number (dispatch)")
    fi
    return 0
}

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
        if ! checks=$(gh_retry api graphql -f query="$checks_query" \
            -F owner="${repo%%/*}" -F name="${repo##*/}" -F number="$number"); then
            failures+=("$repo#$number (checks)")
            continue
        fi
        checks=$(jq -c "$checks_shape" <<<"$checks")
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
        dispatch_review "$repo" "$number" "$head" "reviewable since $reviewable_at"
    done <<<"$prs"

    # A PR that opens, goes green, and merges between two ticks is never open
    # when this runs, so the pass above cannot see it. There is no green check
    # here because a merged PR has already passed whatever gate it had.
    if ! merged=$(gh_retry pr list --repo "$repo" --state merged \
        --search "merged:>=$merged_cutoff sort:updated-desc" --limit 50 \
        --json number,isCrossRepository,headRefOid,changedFiles \
        --jq '.[] | @json'); then
        failures+=("$repo (merged pr list)")
        continue
    fi
    while IFS= read -r pr; do
        [ -z "$pr" ] && continue
        # Same two refusals as above: the hub will not review a fork, and an
        # empty diff gets no review and so never earns a head stamp.
        if [ "$(jq -r '.isCrossRepository' <<<"$pr")" = "true" ]; then
            continue
        fi
        if [ "$(jq -r '.changedFiles == 0' <<<"$pr")" = "true" ]; then
            continue
        fi
        number=$(jq -r '.number' <<<"$pr")
        head=$(jq -r '.headRefOid' <<<"$pr")
        dispatch_review "$repo" "$number" "$head" "merged since $merged_cutoff"
    done <<<"$merged"
done

report="dispatched $dispatched review(s), skipped $skipped_reviewed already reviewed, $skipped_not_ready not green, $skipped_stale reviewable before the cutoff"
echo "::notice::$report"
echo "$report" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
if [ ${#failures[@]} -gt 0 ]; then
    echo "::error::sweep failed for: ${failures[*]}"
    exit 1
fi
