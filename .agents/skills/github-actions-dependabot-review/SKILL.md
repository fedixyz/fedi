---
name: github-actions-dependabot-review
description: >-
  Review Dependabot PRs updating GitHub Actions workflows/actions, with a
  security-focused upstream diff check before commenting.
---

# GitHub Actions Dependabot Review

Use when asked to review Dependabot PRs for GitHub Actions updates.

Target PRs usually have `github_actions` in the branch name or a title like `bump OWNER/ACTION from OLD to NEW`.

For each target PR:

1. Check whether a non-bot human already reviewed it. If yes, stop for that PR and report that it was already reviewed.
2. Inspect PR metadata for the action repository, old and new versions, git hashes, changed workflow files, and Dependabot or changelog notes.
3. Review the upstream action repository outside the working tree. Compare old and new revisions, preferring Dependabot-provided hashes when available.
4. Compare the upstream diff to the changelog. Review with a security-critical mindset: secret/token exfiltration, eval/dynamic code, shell injection, new network calls or downloads, dependency/lockfile surprises, token/permission handling, workflow-command injection, and suspicious generated/minified artifacts.
5. If dependency manifests or lockfiles change (`package-lock.json`, `Cargo.lock`, etc.), review each dependency update similarly. If the dependency diff is too large or infeasible, at least check registry metadata and verify the new version is at least a week old. Raise anything not clearly safe as a concern.
6. Post a concise PR comment using the current agent's normal attribution prefix. Include old/new hashes, what changed, whether it matches the changelog, risks found or explicitly not found, and a clear `OK to merge` / `not OK to merge` recommendation.

Summarize PR link, whether it was already reviewed, whether a comment was posted, and the recommendation.
