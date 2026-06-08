---
name: github-stale-pr-triage
description: >-
  Triage stale GitHub PRs. Use when asked to review old, inactive,
  least-recently-updated, obsolete, or closeable pull requests, comment with a
  recommendation, and close PRs that are clearly no longer useful.
---

# GitHub stale PR triage

Use this when asked to look through old open PRs and decide what should happen with them.

First identify the exact PRs under consideration. Usually this means open PRs filtered by the user's requested age cutoff, count, labels, author, or least-recently updated order.

For each PR, one by one:

- Read the PR description, discussion, reviews, changed files, and diff.
- Check current code and related issues/PRs to see if the work is still needed or was done another way.
- Decide what maintainers should do:
  - close it if it is obsolete, irrelevant, already done, or would need a fresh rewrite;
  - leave it open if it is still useful and looks easy to finish;
  - leave it open with a clear question if the answer is genuinely unclear.
- If possible, delegate each PR to a self-contained sub-agent.

Always write the analysis as a PR comment. Keep it polite and short. Say what you checked, what you concluded, and what the next step should be. If closing, say it can always be reopened if something was missed.

Close when the conclusion is clear and the PR is no longer useful to keep open.

Report back with a short table: PR, decision, action taken, rationale.
