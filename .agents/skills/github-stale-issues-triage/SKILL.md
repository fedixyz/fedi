---
name: github-stale-issues-triage
description: >-
  Triage stale GitHub issues. Use when asked to review old, inactive,
  least-recently-updated, obsolete, already-done, or closeable issues; research
  whether they are still relevant; comment with a short summary; and close issues
  that are clearly done or no longer needed.
---

# GitHub stale issues triage

Use this when asked to look through old open issues and decide whether they are still relevant.

First find the exact issues under consideration. Usually this means the least recently updated open issues; if the user gives `N`, use that as the limit:

```bash
gh issue list -R OWNER/REPO --state open --limit N \
  --search 'sort:updated-asc' \
  --json number,title,author,createdAt,updatedAt,url,labels,body
```

For each issue, one by one:

- Read the issue body and comments.
- Do quick but real research in current code, documentation, tests, and related issues/PRs.
- Judge whether the issue is:
  - still relevant and worth keeping open;
  - partially done, with clear remaining scope;
  - already done;
  - obsolete/no longer needed;
  - unclear and needing maintainer/product input.
- Be conservative when closing: only close issues that seem 100% done, invalid, obsolete, or no longer useful. Leave ambiguous issues open.
- If the batch is large or issues are independent, consider delegating individual issues to sub-agents.

Always post a short issue comment with what you checked and your judgment, even when leaving the issue open. This intentionally bumps stale issues with useful triage context. Keep the comment concise, polite, and single-purpose. When commenting on behalf of the user, prefix it as required by the GitHub CLI skill, for example:

```markdown
*Comment by Tau/AI agent* Checked: current code appears to implement this already via X/Y, so I am closing as done. Please reopen if I missed remaining scope.
```

Close only when the conclusion is clear. Prefer commenting while closing so the close event has context:

```bash
gh issue close NUMBER -R OWNER/REPO --comment-file /tmp/comment.md
```

For issues that remain open, post the comment without changing labels or assignees unless the user explicitly asked for that:

```bash
gh issue comment NUMBER -R OWNER/REPO --body-file /tmp/comment.md
```

Report back with a short table: issue, decision, action taken, rationale.
