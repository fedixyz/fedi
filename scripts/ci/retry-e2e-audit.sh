#!/usr/bin/env bash
#
# Re-dispatch the daily e2e coverage audit when a run died for a reason
# that clears on its own. Called by the agent job of
# daily-e2e-coverage-check.lock.yml after a failure; deliberate failures
# (validator rejections, audit errors) are never retried.
#
# The only transient class detected is an AI provider rate limit, matched
# with the same markers the conclusion job summary greps for; keep the two
# patterns in sync.
#
# Env:
#   GITHUB_TOKEN           token able to dispatch workflow runs
#   GH_AW_WORKFLOW_FILE    workflow file name to re-dispatch
#   GH_AW_RETRY_CAP        max runs of the workflow per UTC day (default 4)
#   GH_AW_AGENT_STDIO_LOG  agent stdio log scanned for rate-limit markers
#   GITHUB_REPOSITORY, GITHUB_REF_NAME  provided by Actions

set -euo pipefail

workflow_file="${GH_AW_WORKFLOW_FILE:?}"
retry_cap="${GH_AW_RETRY_CAP:-4}"
stdio_log="${GH_AW_AGENT_STDIO_LOG:-/tmp/gh-aw/agent-stdio.log}"

if [ ! -f "$stdio_log" ]; then
  echo "No agent stdio log at ${stdio_log}; not retrying"
  exit 0
fi

if ! grep -qE 'isRateLimitError=true|"type":"turn\.failed".*(429|[Tt]oo [Mm]any [Rr]equests|[Rr]ate.?limit)' "$stdio_log"; then
  echo "Failure does not look transient; not retrying"
  exit 0
fi
echo "Transient failure detected: AI provider rate limit"

today=$(date -u +%Y-%m-%d)
runs_today=$(gh api \
  "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_file}/runs?created=%3E%3D${today}&per_page=1" \
  --jq '.total_count')
if [ "$runs_today" -ge "$retry_cap" ]; then
  echo "Already ${runs_today} runs today (cap ${retry_cap}); not retrying"
  exit 0
fi

echo "Re-dispatching ${workflow_file} on ${GITHUB_REF_NAME} (run ${runs_today} today, cap ${retry_cap})"
gh workflow run "$workflow_file" --ref "$GITHUB_REF_NAME"
