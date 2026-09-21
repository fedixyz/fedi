---
name: backport-review
description: >-
  Review Fedi PRs targeting release/* as backports. Verify the changes against their master PRs, explain prerequisites and adaptations, and check production exposure. Defer feature review to the master PR.
user-invocable: true
---

# Backport Review

For `release/*` PRs, review the port and its production effect. Feature review belongs on the corresponding master PR, not the release PR.

## Read first

Start with the PR title, source branch, and listed PRs in `sieve-pr-context.json`. Outside the hub, use `gh pr view --json title,body,baseRefName,headRefName`.

Use the manifest's `baseRef` as `BASE` and the reviewed head as `HEAD`. Without a manifest, resolve the PR's comparison base. Read the final diff and `git log --oneline BASE..HEAD`.

## Prove the port matches

- Locate the original master commits from the listed PRs, commit subjects, or cherry-pick trailers. Compare each pick with its original using `git show COMMIT | git patch-id --stable` on both commits.
- If the same change has parallel master and release PRs, compare their diffs directly, even if the master PR is unmerged. Defer feature review to that PR.
- Account for the listed changes and any extra commits. Explain needed prerequisites and check they exist on the release branch. Inspect adaptations and conflict resolutions against the original behavior. Unrelated differences between master and release files are not defects in the pick.

Keep investigation scoped to explaining the release diff. If the master counterpart or comparison cannot be established, name the gap with `cannot-judge-alone`; do not substitute a normal feature review.

## Production pass

Confirm any version bump and what deployment exposes, distinguishing a release-preparation merge from going live. For gated changes, consult `.agents/skills/feature-flags/SKILL.md` (from `origin/master` if absent locally). Use production flag values when available; otherwise state exposure conditionally.

## Shape the review

For a clean match, recommend `merge`: one verdict, one compact evidence block mapping changes to master PRs, and a production note. No fresh screenshots or diagrams are required for this fidelity review. Keep the full file-tree last.

Inherited master-code concerns are `fyi` with the original PR link. Port regressions, missing prerequisites, or newly exposed production risks can block with evidence. An omitted explanation alone is minor.
