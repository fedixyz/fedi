#!/usr/bin/env bash
#
# Re-dispatch the daily e2e coverage audit when a run died for a reason
# that clears on its own. Called by the conclusion job of
# daily-e2e-coverage-check.lock.yml after an agent failure; deliberate
# failures (validator rejections, audit errors) are never retried.
#
# The only transient class detected is an AI provider rate limit, matched
# with the same markers the conclusion job summary greps for; keep the two
# patterns in sync.
#
# Plain curl against the REST API: the conclusion job's slim runner image
# is not guaranteed to carry the gh CLI.
#
# Env:
#   GITHUB_TOKEN           token able to dispatch workflow runs (actions: write)
#   GH_AW_WORKFLOW_FILE    workflow file name to re-dispatch
#   GH_AW_RETRY_CAP        max runs of the workflow per UTC day (default 4)
#   GH_AW_AGENT_STDIO_LOG  agent stdio log scanned for rate-limit markers
#   GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_API_URL  provided by Actions

set -euo pipefail

workflow_file="${GH_AW_WORKFLOW_FILE:?}"
retry_cap="${GH_AW_RETRY_CAP:-4}"
stdio_log="${GH_AW_AGENT_STDIO_LOG:-/tmp/gh-aw/agent-stdio.log}"
api_url="${GITHUB_API_URL:-https://api.github.com}"

if [ ! -f "$stdio_log" ]; then
  echo "No agent stdio log at ${stdio_log}; not retrying"
  exit 0
fi

if ! grep -qE 'isRateLimitError=true|"type":"turn\.failed".*(429|[Tt]oo [Mm]any [Rr]equests|[Rr]ate.?limit)' "$stdio_log"; then
  echo "Failure does not look transient; not retrying"
  exit 0
fi
echo "Transient failure detected: AI provider rate limit"

auth=(-H "Authorization: Bearer ${GITHUB_TOKEN:?}" -H "Accept: application/vnd.github+json")

today=$(date -u +%Y-%m-%d)
runs_url="${api_url}/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_file}/runs?created=%3E%3D${today}&per_page=1"
if ! runs_json=$(curl -fsS "${auth[@]}" "$runs_url"); then
  echo "Run-count query failed; not retrying"
  exit 0
fi
runs_today=$(printf '%s' "$runs_json" | grep -o '"total_count": *[0-9]*' | head -1 | grep -o '[0-9]*$' || true)
if [ -z "$runs_today" ]; then
  echo "Could not read total_count from the run-count response; not retrying"
  exit 0
fi
if [ "$runs_today" -ge "$retry_cap" ]; then
  echo "Already ${runs_today} runs today (cap ${retry_cap}); not retrying"
  exit 0
fi

echo "Re-dispatching ${workflow_file} on ${GITHUB_REF_NAME} (run ${runs_today} today, cap ${retry_cap})"
curl -fsS "${auth[@]}" -X POST \
  "${api_url}/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_file}/dispatches" \
  -d "{\"ref\":\"${GITHUB_REF_NAME}\"}"
