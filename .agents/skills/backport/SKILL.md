---
name: backport
description: >-
  Build a Fedi native patch release 26.M.P: the milestone, the backport/26.M.P branch of master PRs cherry-picked onto release/26.M, the version bump commit, the Backport/26.M.P PR and the version sync PR to master. Use whenever someone asks to start, build, extend or finish a backport or patch release. Reviewing a backport PR is the backport-review skill. Store preparation is ios-release and android-release.
user-invocable: true
---

# Fedi backport

A patch release `26.M.P` is a set of master PRs cherry-picked onto `release/26.M`, merged through one PR. Every step below has one shape. Keep it, so one backport looks like the last one and the next agent can pick the branch up where it stands.

## Milestone

- the milestone is the patch version, `26.M.P`. Create it if it is missing: `gh api repos/fedibtc/fedi/milestones -f title=26.M.P`
- `26.M.X` is the holding milestone for "the next patch of 26.M". When a patch starts, move everything in it to `26.M.P` and leave it empty
- the milestone holds two kinds of items: the master PRs that ship in the patch, and the issues those PRs close. Find the issues through the PR, `gh pr view N --json closingIssuesReferences`, and set the milestone on both with `gh issue edit N --milestone 26.M.P` (it works on a PR number too)
- the backport PR itself carries the milestone as well

## Branch

- `backport/26.M.P` from the tip of `origin/release/26.M`, in a worktree
- `git cherry-pick -x <sha>` of each master PR's squash commit, one pick per PR, in master merge order (`gh pr view N --json mergedAt,mergeCommit`). Master order keeps later picks applying on the lines earlier picks changed. A terminology or i18n PR picked after the fixes that touch its strings conflicts on every string it renamed
- only commits already on master. A PR that is still open on master waits, listed in the PR body as unchecked
- after each pick, compare `git show <pick> | git patch-id --stable` with the master commit. A pick that needed conflict resolution gets its adaptation named on its bullet in the PR body
- the version bump is its own commit, last on the branch: `chore: bump version for 26.M.P`. The version-bump skill covers the files and the commands

## Backport PR

- draft, base `release/26.M`, title `Backport/26.M.P`, milestone `26.M.P`, no labels
- the body is this and nothing more:

```md
cherry-picked onto release/26.M:

- [x] #1111 - what the pick does, in one line. a conflict and its resolution go here too
- [x] #2222 - what the pick does
- [ ] #3333 - what the pick does, still open on master

bumped version to 26.M.P. master sync in #4444
```

- every reference in the body is a master PR. Issue numbers never appear in a backport PR body, not even as "closes #N". The issues sit on the milestone and belong to the master PRs that fix them
- checked means picked, unchecked means waiting on master. Update the body as picks land. The branch and the PR stay open until the patch is complete
- write-pr and prose-style run on the body before it is published, as for any PR

## Version sync PR to master

- master carries the same version number as the newest patch, so the bump commit goes to master through its own PR. Skip it when master is already past that version, which is the case for a patch on an older release line once the next major has been cut
- branch `sync-version-26.M.P` under your usual prefix, from `origin/master`, holding `git cherry-pick -x` of the bump commit and nothing else
- draft, base master, title `chore: bump version for 26.M.P`, label `sync versioning` (one label, with the space). Body:

```md
## Description

- ref #<backport PR>, syncs the 26.M.P version bump from the backport branch to master
```

- `gh pr create --draft --base master --label 'sync versioning' --title 'chore: bump version for 26.M.P' --body-file <draft>`, then read the label back with `gh pr view N --json labels`

## Finish

- CI green on both PRs. Rerun only for a known flake
- merging is the release owner's call. Never merge and never mark a draft ready unasked
- report the milestone contents, both PR links, every pick that conflicted and how it was resolved, and every PR still waiting on master
