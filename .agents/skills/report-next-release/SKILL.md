---
name: report-next-release
description: >-
  Report what is queued for the Fedi app's next release, at any time, independent of any cut or deployment. Use whenever someone asks what is going into the next release, what has merged to master since the last cut, whether a backport or hotfix is in progress, which milestone issues are done vs planned vs untagged, or what has passed QA, or wants to prep release notes, a release readout, a release rundown, or a monthly-cut check, even if they never say "report" or name a version.
---

# Report the next release

Generate, at any time, a grounded report of what the next Fedi release will contain, plus the milestone bookkeeping that tends to rot when developers merge faster than anyone tags issues.

The output is one self-contained HTML file with two tabs, rendered by the bundled script:
- **Summary** (default): a condensed, plain-language product view for a non-technical reader (product, ops, leadership). Clustered product items, not a ticket dump, and no release mechanics at all.
- **Full report**: the PR-by-PR breakdown, release-track state, milestone status with each issue's Zenhub board columns, QA sign-off, backport detail, and the prepared milestone-tagging commands.

Those are two altitudes rather than two lengths, which is the distinction that decides whether the report is usable.

Plus a short markdown briefing the script prints to stdout, which you relay into chat. The page is dark by default with a light toggle. That is the renderer's job, not yours.

Default repo is `fedibtc/fedi`. The commands below assume it, so swap `OWNER/REPO` if asked.

## Say native app and web app

Never "phone app", "mobile", or "the app" when you mean one of the two. The two surfaces are the **native app** (iOS and Android, one codebase, one version line) and the **web app** (`app.fedi.xyz`, a PWA). They share `ui/common` and the bridge. Getting this wrong makes a reader think one thing is shipping when there are two.

## The two tabs are two altitudes

The Summary is not a shorter Full report, it is a higher one. It goes wrong by accretion. Every mechanical fact from Step 1 wants to be on the first screen, and putting it there buries the reader in shas, tags, merge-base language and day counts before they learn one thing a person using the app would notice.

**Nothing mechanical goes on the Summary.** No sha, tag, branch name, merge-base, PR number, milestone name, PR count, or "N days since" phrasing, outside the short glance strings the lanes render. All of it belongs on Full report, which exists so the Summary does not have to carry it. The renderer enforces the split rather than trusting the prose, and warns on stderr when copy runs over budget. Read that stderr.

**The first screen is a claim, one sentence, the lanes, one line about the patch.** Then product cards. If a reader scrolls past mechanics to reach the first thing a user would feel, the Summary has failed however accurate it is.

**The lane is the mental model.** Two pipelines side by side, up to four stops each, live then in flight then waiting then next. It exists for one misconception: readers assume Fedi has *a* current version. It has two, cut on independent schedules, and a reader who does not hold that misreads every card below.

**Default `tracks.focus` to `none`, and expect to leave it there.** It takes `native`, `web` or `none`, and at most one track ever expands. Timing and volume are the least interesting thing on this page, so two quiet one-line lanes are the normal shape. Expand a lane only when that track is stuck in a way somebody has to act on this week, like a build sitting in app store review. "Behind schedule" is not stuck. This repo is always behind schedule.

**Everything the lane says is release mechanics, so it stays small and it stays out of the title.** Versions, counts and dates live in the lane lines and on Full report. The title and lede carry substance. When both halves obey that split there is nothing to deduplicate, and when they do not, the top of the page says the same thing three times and a reader learns nothing before scrolling.

**Point the emphasis at the anomaly.** One stop per lane renders highlighted, and `glance.emph` chooses which. It defaults to `waiting`, which is right when the story is an uncut queue and wrong the moment it is not. If a build has been sitting in app store review for three weeks, emphasize `in_flight`. Emphasizing `live` is almost always wrong: it highlights a version number when the reader needs the thing that is stuck.

**`in_flight` is the stop for work that has left master but has not reached anyone.** A cut release awaiting app store approval, or a patch being cherry-picked right now. Omit it when nothing is in flight, which is the common case. Without it the lane silently claims a straight line from queue to next release, and an urgent backport gets demoted to the grey footnote under the lanes.

**Platform is an icon, not a word.** Each card carries three fixed slots at the end of its chip row, iOS then Android then Web, lit for the platforms it lands on and dimmed for the rest. The slots never move, so a reader learns the positions once and after that takes platform in without reading. It is also the only notation that can say android-only or iOS-only, which is why `platforms` exists alongside the coarser `track`.

**The card grids ship three layouts and default to All.** A `Layout` switch on the section heading regroups them in the browser. All is the authored order in two flat sections. Status and Platform both group into collapsible panels, with one Expand all control rather than a click per panel. Platform groups on the whole platform set, so a change that lands everywhere appears once instead of once per platform. Leave the default alone unless a release genuinely reads better grouped, and never hand-order cards to fake a grouping the switch already does.

**The title and lede are about substance, never schedule.** The most valuable line on the page says what people get. "Fedi 26.7 at a glance" is a label and wastes it. "Nothing in 26.7 has reached a user yet" is release mechanics, which the lane lines and Full report already carry. "The web app finally gets withdrawals, reactions and request-to-join" tells a reader what changed.

No dates, day counts, version numbers, PR totals or "still uncut" phrasing in either the title or the lede. If the only thing you can think to say is how long something has been waiting, you have not read the cards closely enough: name the two or three changes a person would actually notice. Keep the title near 90 characters and the lede to one or two sentences that carry the next most important things, or who they affect.

The test, run against the screenshot rather than the markup: **read only the first screen as a product manager who was not in this session. Do you know what is going out, on which app, and what is being asked of you?** If not, the fix is more altitude, never more detail.

## Fedi release conventions you need

- **Calendar versioning (CalVer).** A version is `YY.M[.patch]` where `M` is the calendar month: `26.6` is June 2026, `26.7` is July 2026. The monthly release is `26.M.0`, patches are `26.M.1`, `26.M.2`, and the next major is next month's `26.(M+1).0`.
- **Two tracks, cut and deployed independently.** Native ships from a `release/26.M` branch. Web ships as a `web/X.Y.Z` tag with no branch. Neither waits for the other, so a single "current version" is always a lie. Step 1 pins both.
- **"Shipped" is wrong for unreleased work.** Merged to master is *not* released. Merged and queued is **"Pending release"**, an open PR is **"In progress"**, a milestone issue with no code is **"Planned"**. Reserve "shipped/live" for a production flag actually being on, which this report does not assert.
- **No em or en dashes anywhere** in any file you write. Use a regular hyphen. The renderer warns if any slip into the HTML.

## What a milestone means here, and when an issue closes

Read this before you interpret a single issue state, because the obvious reading is wrong.

**A milestone records intent for almost all of its life.** It becomes a record of delivery only at the end: once a release is live in production, the issues that went out are closed and the milestone is closed. So a milestone with open issues is a set of promises, not a set of failures, and an issue sitting on a shipped milestone is not evidence of a mistake.

**Issues are closed only when the release is live**, not when the fix merges. That is why this repo never uses `closes` or `fixes` keywords in PR bodies, and it is the reason `closingIssuesReferences` is empty across the whole set. The empty field is a deliberate consequence of the process, not sloppiness.

The consequence you have to hold onto: **an open issue is not evidence the work is not done.** Judge every issue by whether a merged PR addresses it, never by its state. Getting this backwards makes the report claim finished work is still outstanding.

**Cutting a release is not the end of the line.** QA is manual and cannot be meaningfully automated today. It runs *after* the cut, in parallel with app store review, because review does not block QA. If the build is approved and QA is clean, it ships. If QA finds a bug, the fix is cherry-picked onto the release branch. That fix arrives as a new PR, sometimes against the original issue where a tester recorded the failure, sometimes against a newly filed release-blocking issue. Both patterns are in the history, so do not assume either when you see post-cut activity on a release branch.

This is why the cut stays a human decision, and why the report's job is to make that decision well-informed rather than to make it.

## The Zenhub board, and the question GitHub cannot answer

Issues stay open until a release is live, so GitHub state cannot tell you whether work is finished or whether anyone tested it. That lives on the Zenhub board. The `zenhub` skill covers the CLI in full, and this is what the report needs from it.

`fedibtc/fedi` is on five workspaces, so `--workspace` is required on every call. Two of them matter here:

- **Dev Team**: `Needs Triage | Reviewed and Estimated | Queue | In Progress | Code Review | Blocked | Blocked by Design | QA | Ready for Prod`. How far the work got.
- **QA**: `All Issues | To be Tested | For RC Testing | Waiting for Devs | Testing Blocked | Failed Test | Passed Test | Not Tested | Unable to Test`. Whether a tester signed off.

**`All Issues` is the QA board's default column, not a verdict.** An issue sitting there was never triaged into a test state. Most of any release is there, and reading that as failure is the easiest mistake to make with this data. Say "no QA verdict yet", never "failed QA".

**Three signals, three questions, and none implies another.** The board says where the work is in the workflow. The `ios pass` / `android pass` / `web pass` labels say a tester verified that platform, usually against Nightly, so a pass can predate the cut. GitHub open or closed says only whether the carrying release is live. Name which one you read whenever you make a claim about QA.

**The board outranks this report's own inference.** The resolver scrapes `#NNNN` out of PR *bodies* only, so a fix linked from an issue comment is invisible to it. Issue #11313 was fixed by #11493 and verified on Nightly with the link left in a comment, and the report called it not started. So before you call any issue `pending`, read its Dev Team column. `Ready for Prod`, `QA` or `Code Review` against a "no code yet" verdict means the report is wrong. Go find the PR rather than trusting the resolver.

Column to report status:

| Dev Team column | status in this report | status on the summary |
|---|---|---|
| Ready for Prod | `done` | Pending release |
| QA, Code Review, In Progress | `inprogress` | In progress |
| Queue, Needs Triage, Reviewed and Estimated | `pending` | Planned |
| Blocked, Blocked by Design | `pending`, and name the block | Planned |

**Reading is free, writing is not.** This report never moves an issue. The board is shared, and a move is an outward-facing write. If a column looks wrong, say so and let the user decide.

## Step 1: Pin both release tracks

This is the step that makes the rest correct, and it is the one people skip. Do it before touching pull requests. Everything here goes into the report's `tracks` block, and the renderer warns on stderr if you omit it.

Two audiences come out of this step, so capture both as you go. The precise version, with baselines and the branch nuance, is the full report's. The glance version is six short strings per track that a non-technical reader can take in at once, listed in Step 8. Write the glance strings here while the facts are in front of you, rather than trying to compress the note later.

### Native

```bash
git fetch origin --tags --quiet
git branch -r | grep -E 'release/[0-9]|backport/'
gh release list --repo fedibtc/fedi --limit 8
gh api 'repos/fedibtc/fedi/milestones?state=all&per_page=100' \
  --jq '.[] | "\(.number)\t\(.state)\t\(.title)\topen:\(.open_issues)\tclosed:\(.closed_issues)"' | sort -t$'\t' -k3 -V
```

`state=all` is load-bearing. The endpoint defaults to open milestones only, which in this repo is three of roughly forty, and it hides every milestone you need to reason about history: the last major, and every patch. Every patch since `26.1.1` has its own milestone and all of them are closed, so an open-only listing makes the patch milestone look like it does not exist and invites you to propose creating one that has been there for weeks.

`release/26.M` for the highest `M` is the source-of-truth answer to "what is in production". Its contents are master at the cut point, plus any backports merged onto it, **minus anything reverted on the branch**. Git cannot see app store approval, so the strongest in-repo signal that a version is actually out is the **published GitHub release**, which fires the public APK workflow. A draft release is not out.

The released baseline is the branch point, which should equal the `26.M.0` tag:

```bash
BASE=$(git merge-base origin/master origin/release/26.M)
git log -1 --format='%h %ci %s' "$BASE"        # expect the "bump version to 26.M.0" commit
git rev-list --count "$BASE"..origin/master    # commits queued since
```

The next major is `26.(M+1).0`. Confirm a milestone of that name exists. If no `release/26.(M+1)` branch exists yet, say so plainly: the release has not been cut, and the report is the live contents of master.

### Web

Web has no release branch. A release is a `web/X.Y.Z` **tag**, deployed by a manual `workflow_dispatch` of `vercel-prod.yml`. The Production environment rejects anything that is not a `web/*` tag. See the `web-release` skill for the deploy procedure.

A web tag is cut one of two ways, and the difference is about ancestry, not about content:

- **Tagged on master.** Everything merged before that commit ships.
- **A cherry-pick lineage.** Branch off the previous web tag, take only the commits you want, tag, delete the branch. This is the general mechanism for shipping a **subset** of master, and it says nothing about what is in the subset. Historically it has carried whole releases: `web/26.2.0` carried 335 commits this way. Recently it has carried single feature-flag flips, which are still real deploys, because `app.fedi.xyz` serves `/api/features` to the native app as well as to itself.

So do not read "lineage" as "not a real release". Read the size:

```bash
git tag --merged origin/master 'web/*' | sort -V | tail -1    # baseline candidate
git tag -l 'web/*' | sort -V | tail -1                        # newest tag, lineage or not
git log --oneline <baseline>..<newest>                        # what the lineage tags actually carried
gh run list --repo fedibtc/fedi --workflow vercel-prod.yml --limit 5 \
  --json headBranch,conclusion,createdAt \
  --jq '.[] | "\(.createdAt[0:10])\t\(.conclusion)\t\(.headBranch)"'
```

The deployed ref is whichever one the last **successful** production run used, never the newest tag by name.

The newest tag on master is your baseline, but treat it as a **lower bound on what has shipped, not an exact line**. A lineage tag can carry work that merged after that baseline, and that work is out even though the baseline commit predates it. So compute the window from the baseline, then read what the lineage tags carried and subtract anything real from it. Two one-commit flag flips subtract nothing. A 300-commit lineage means most of your window already shipped and the report would be badly wrong to claim otherwise.

The web milestone is `web-26.(M+1)`.

## Step 2: Run the resolver

Steps 2, 4 and 5 are mechanical, high-volume, and where this report goes wrong when done by hand. A bundled script does all of it in about ten seconds:

```bash
python3 <skill-dir>/scripts/resolve_window.py --repo fedibtc/fedi --repo-path . \
  --milestone "26.7.0" --milestone "web-26.7" > window.json
```

It derives both baselines, lists every PR merged to master since the earlier of them, scrapes `#NNNN` out of every PR body, resolves each reference to issue-or-PR with its state, milestone, labels and title, marks bot-filed `agentic-workflows` refs as noise, and pulls **all** milestones with `state=all`. Read its stderr: it warns when the release branch has been rebased off its tag, and when the newest web tag is a lineage carrying commits you may need to subtract from the web window.

Pass `--milestone` once per milestone, for the next major and the next web release. That pulls every issue on each one, which is Step 6's input, and it is the difference between checking the work you happened to find through PR bodies and checking the work someone actually promised.

Every issue it touches, referenced or milestoned, comes back with `board: {dev, qa}` from the two Zenhub workspaces. Batches are 20 issues per call, and a number that is not an issue 404s the whole batch, so the resolver only ever sends numbers it has already confirmed. Hold to that if you run `zenhub status` by hand.

If the key is missing the resolver warns and returns no board state. Rerun with `--no-zenhub` and say in the report that board state is unavailable. Do not quietly drop the QA question.

It deliberately does not decide whether a PR *resolves* a referenced issue or merely mentions it. That judgment is yours, and Step 6 covers it.

Everything below is what you do with `window.json`. The raw commands are kept so you can spot-check any single answer, not so you can run the whole thing by hand.

Two baselines mean two windows over the same master history.

```bash
NATIVE_BASE=$(git merge-base origin/master origin/release/26.M)
WEB_BASE=$(git rev-list -1 "$(git tag --merged origin/master 'web/*' | sort -V | tail -1)")
```

The native window is `NATIVE_BASE..master`. The web window is `WEB_BASE..master` restricted to what a web release would carry (`ui/web`, plus `ui/common` where the web app consumes it), **minus anything a later lineage tag already cherry-picked**. They overlap heavily and the two baselines are usually days apart, which is fine. Count each PR once, under the track that actually gates it reaching a user: a web-only change is gated by the next web tag, a native or bridge change by the next `release/` cut, and shared work by both.

If the two baselines are far apart, that gap is the useful number, not a scandal. Put it in the track note.

## Step 3: Detect a backport in progress

```bash
git log --format='%h %s' origin/release/26.M..origin/backport/26.M.1
gh pr list --repo fedibtc/fedi --base release/26.M --state all --limit 10 \
  --json number,title,state,mergedAt,headRefName
```

A backport is a cherry-pick of PRs **already on master**, applied to `release/26.M` and usually squash-merged as one commit, so its constituents are invisible to `git log` and you have to read the PR body:

```bash
gh pr view <backport-pr> --repo fedibtc/fedi --json body,commits
```

Map each cherry-pick back to the master PR it came from by matching the title. Those PR numbers are the **backport-excluded set**: they ship in the patch, so they are not new in the next major.

Three outcomes, all of them real answers:
- an unmerged backport branch or an open PR against the release branch: a patch is in progress, report its contents
- a merged and tagged patch: it already shipped, so exclude its contents and say when it went out
- neither: no backport in progress, stated in one line

## Step 4: Enumerate the window PRs

```bash
gh pr list --repo fedibtc/fedi --base master --state merged --search "merged:>=<BASE-date>" --limit 300 \
  --json number,title,mergedAt,author,milestone \
  --jq 'sort_by(.mergedAt) | .[] | "\(.number)\t\(.mergedAt[0:10])\t\(.author.login)\t\(.milestone.title // "-")\t\(.title)"'
```

Cross-check against the git log so you neither miss a PR nor include one merged just *before* the branch point. Then exclude the version-bump and release-prep PRs at or below the branch point, and the backport-excluded set from Step 3.

## Step 5: Resolve each PR's linked issues

The GitHub "closing issue" field is empty across essentially this whole set, and PR milestones are near-useless (expect roughly one PR in a hundred to carry one, and it is often a PR that should not have been milestoned at all). So read PR bodies and pull every `#NNNN`, then classify each reference as an issue or a PR and fetch its milestone, state and title:

```bash
gh pr list --repo fedibtc/fedi --base master --state merged --search "merged:>=<BASE-date>" \
  --limit 300 --json number,title,body,mergedAt,author > /tmp/window.json
# scrape #NNNN out of each body, then for each distinct ref:
gh api repos/fedibtc/fedi/issues/<REF> --jq '[(if .pull_request then "PR" else "ISSUE" end), .state, (.milestone.title // "-"), .title] | @tsv'
```

`resolve_window.py` already did this. Run these only to check a single answer you doubt.

Refs labelled `agentic-workflows` are robots filing tickets about themselves, not release content. The resolver marks them `"noise": true` and lists them under `issue_refs_dropped_as_noise`.

What is left for you is the one judgment the resolver refuses to make: **does this PR resolve the issue, or just mention it?** The reference alone does not tell you. PR #11489 shipped basic `makeInvoice` support and its author filed #11511 as the follow-up work, so treating that reference as a fix would tag and eventually close the wrong issue. Read the PR body when the relationship is not obvious, and when it stays ambiguous, leave the issue out of `needs_milestone` rather than guessing.

## Step 6: Milestone hygiene, and the decision to offer

Sort referenced issues into buckets:

- **On the next milestone already** (`26.(M+1).0` or `web-26.(M+1)`): mark each `done` (a merged window PR addresses it), `inprogress` (its fix is open, not merged), `backport` (its fix ships in the patch), or `pending` (no code yet). Also list milestone issues that *no* window PR touches: that is the planned-but-unstarted work, and it is usually the most actionable part of the report.

  Reconcile each one against its Dev Team column before you settle on a status. The board and the PR-body inference disagree in exactly one direction that matters, and the board is right: an issue in `Ready for Prod` is finished no matter what the PR bodies say. Chase the missing link, correct the status, and carry the `board` block through to the report JSON so the reader sees both.
- **No milestone at all**, but resolved by a window PR. Suggest one by track: a web-only fix goes to `web-26.(M+1)`, everything else to `26.(M+1).0`.
- **Milestoned to an earlier release**: resolved on master and riding into this release, already tagged. List for awareness, no action.

**The invariant that makes tagging safe:** a major release is cut from master, so an issue resolved by a merged master PR ships in the next major whether or not anyone tags it. Tagging does not decide the release, it decides whether the work shows up in the release notes. So the untagged set is not a judgment call, and presenting it as fourteen separate decisions is the wrong shape.

Two things look like exceptions and only one is:

- **Backports are not an exception.** A backport only contains PRs already on master, so it never adds anything the next major would not have had. Its only effect is that the issue ships *earlier* than its milestone says. Put those issues on the **patch** milestone (`26.M.1`), which already exists and is closed, rather than on the next major. Every patch since `26.1.1` has one, so never propose creating it.
- **Release-branch reverts are.** A release branch can carry a revert that master does not have, pulling merged work back out of that release while it stays on master. `release/26.5` did exactly this to three merged features (`#10929`, `#10834`, `#10758`), all three still on master today. So "merged to master" implies "in the next release" only until someone reverts on the branch. That is a reconciliation to run at cut time, not a reason to withhold tagging now:

```bash
git log --format='%h %s' origin/release/26.M --not origin/master --grep=Revert
```

So propose the whole set and **ask once**. The renderer builds that ask for you: `render_report.py` prints a milestone block after the briefing with the count, one GitHub link that lists exactly the flagged issues, a link per issue with its suggested milestone and the PRs that resolved it, and an explicit "nothing has been applied". Relay that block verbatim and stop.

Do not ask per issue, do not paste the commands as the answer, and do not run anything before the user replies. Tagging is cheap to do late and annoying to undo, so the review gate is the point.

If the user says go:

```bash
gh issue edit <n> --repo fedibtc/fedi --milestone "26.7.0"
```

Run them, then report what changed and anything that failed. Reasons a single edit fails: the milestone is closed (fine for a patch milestone, the edit still works), the issue is locked, or the title you matched belongs to a PR rather than an issue. If they do not reply, nothing is lost. The report keeps the list and the commands.

## Step 7: Categorize user-facing vs internal

Judge every PR by one test, the same one the `product-activity-report` skill uses:

> Does a person using the app feel this?

Judge by impact, not by the commit prefix. A `feat` can be pure developer tooling (out of the product story). A `fix` to a crash is deeply user-facing (in). Tests, build/CI, refactors, skills, and docs are almost always internal. Feature flags and selectors are plumbing for a user feature: fold them into that feature, do not list them alone.

For the **Summary** tab, cluster into a handful of product items written in plain language (what a user would tell a friend), each with a `kind` (New feature / Improvement / Fix), a `status` (Pending release / In progress / Planned), and a `track` (Native / Web / Native + web). Take `status` from the Dev Team column where the item has one, using the mapping in the Zenhub section, rather than inferring it a second time. The track chip is what stops a reader assuming everything lands everywhere at once. Split distinct fixes into their own cards rather than lumping them. Keep it to roughly a page or two: this is a briefing, not a changelog.

### The card body is the hardest 20 words in the report

The headline says what changes. The body adds what the headline structurally cannot: **when it fires, who hits it, how bad it was, what people did instead.** That is the whole job.

Everything else on the card is already rendered as a chip, so writing it again is pure tax:

- **Never restate the `kind` or the section.** "Fixed." under a heading that says Fixes is noise. So is "This is a new feature."
- **Never restate the `status`.** The chip says Pending release. The body does not.
- **Never put a QA verdict in the body.** "Signed off by a tester" is the Zenhub `Passed Test` column, which is release mechanics and belongs on Full report with the rest of the board state. Gathering the QA data is not a reason to place it here.
- **Never paraphrase the headline.** "Crash when opening community chats" followed by "The app could crash on opening a community chat" is the same sentence twice. If the headline already covers it, either add scope ("it fired from the Spaces list, which is the main way in") or ship the headline with no body at all.

The 300-character cap is a **ceiling, not a target**. A body of eight words that names the trigger beats three padded sentences. When a fix is genuinely self-evident, the honest card is a headline and nothing else.

Before rendering, read the cards as a block rather than one at a time. Repetition is invisible in isolation and obvious in a column.

### Every sentence in a card body is a claim you have to source

The card body is the only prose in the report that nobody wrote before you. The PR tab quotes titles, the milestone tables copy the board, the resolver produces the mapping. The body is synthesis, which makes it the one part that can be fluent, well-shaped and false.

**Source it from the diff or the PR body, never from the title.** A title names the area that changed. It does not carry when the change fires, what the behavior was before, or who hit it, and that is the entire job of the body. Reading the diff to write a card is the work, not preparation for the work.

**Write what a user observes. Treat any sentence about machinery as a claim needing a line of code behind it.** "The action menu only appeared on a second try" is observed. "The clear was debounced" is a claim about how the code works, and if you did not read the debounce you invented it. When the mechanism genuinely is the point, find the line first and write the sentence second.

**Sentences about when something takes effect are the most dangerous ones on the page.** Lands without a restart, applies immediately, refreshes in the background, stays cached until, reaches the session you are in. Propagation and caching behavior never appears in a title, and it is routinely the opposite of what the title suggests: a change that fetches a value sooner usually still applies it at the next launch. Trace every one of these to code, every time. Read the doc comment on the function and the comment at the call site first, because on this class of claim they are usually explicit, and usually the thing you are about to contradict.

### A feature card says a user can do something, so check what gates it

Name everything that has to be true for a real person to see the change, and check each one against live state rather than the PR:

- **remote feature flags**: production values live in `ui/web/src/pages/api/features.ts`, and `https://app.fedi.xyz/api/features` says what is actually being served. Off in production means the code ships and the feature does not. Keep the card, badge it, and say the flag is off, rather than deleting the card or claiming the feature.
- **compiled-in defaults**: `crates/runtime/src/features.rs` holds the base catalog the remote layer overrides, and Nightly and production differ. A feature testable on Nightly is not a feature that shipped.
- **federation or community config**: a capability gated on a federation's modules or metadata reaches only the federations carrying it, which is not the same claim as "everyone gets this".
- **the platform**: derive it from the paths the PRs touch. `ui/native` only is native, `ui/web` only is web, and `ui/common`, `bridge/` or `crates/` is all three, because the wasm bridge compiles the same crates the native app does. The diff beats the PR's own parity note, which is written from intent and is wrong often enough to matter. For a merge commit use `git show --diff-merges=first-parent`, since a plain `--name-only` prints nothing and reads as touching no files at all.

Auditing which flags are on is a different pass from auditing how flags propagate, and passing the first says nothing about the second. One card that lumps a gated change together with an ungated one cannot be badged honestly, so split it.

## Step 8: Build the report JSON

Write one JSON file capturing your synthesis. This is the only judgment-heavy artifact. The renderer does all formatting, so the quick briefing and the rich report can never disagree.

Put it in a scratch run dir (`scratch new next-release-report "..."`), not in the repo.

See `references/example-report.json` for a complete, fillable example with every field populated. The shape:
- `repo`, `generated_at`, `next_release`, `full_title`, `window`, `intro`
- `tracks`: `{native:{...}, web:{...}}`. Each track carries the full-report fields **and** a glance block, because the two tabs sit at different altitudes:
  - full report: `{current, next, baseline, in_window, milestone, note}`. `current` is what is in production on that track, `baseline` is the commit the window opens at and how you derived it, `note` is the nuance a reader would otherwise get wrong. Be as precise and as technical as the facts require. This is the only place that nuance belongs.
  - `glance`: the short strings that render as the summary lane. Values cap at 34 characters, notes at 42, and the renderer warns past that.
    - `{live, live_note, waiting, waiting_note, next, next_note}` are the three stops every lane has. `live` is the bare version (`26.6.1`, `web/26.6.2`). `waiting` counts what a user would feel (`15 user-facing changes`), never a raw PR total. `next` is the version that has not happened yet. Each note is the one clause a non-technical reader needs: `out since 14 July`, `no code deploy in 52 days`, `not cut yet`.
    - `{in_flight, in_flight_note}` is the optional fourth stop, between `live` and `waiting`, for a build that has left master but reached nobody: `26.7.0` / `in app store review, 12 days`. Omit both keys when nothing is in flight.
    - lane size is not per-track. `tracks.focus` (a sibling of `tracks.native` and `tracks.web`) names the single track to expand, one of `native`, `web`, `none`. Everything else collapses to a line. See the altitudes section for how to choose.
    - `emph` names the stop that renders highlighted, one of `live`, `in_flight`, `waiting`, `next`. Defaults to `waiting`. Point it at the anomaly.
- `backport`: `{in_progress, version, pr, base_branch, items[], headline, note}`. `headline` is the single sentence the Summary shows, so write it for someone who does not know what a backport is. `note` is the full account, including which PRs were cherry-picked, and renders on Full report only. Keep that list out of `headline`.
- `summary`: `{title, lede, features[], fixes[], planned_keep, planned_park[]}`. `title` is a claim rather than a label, near 90 characters. `lede` is one or two sentences under about 240. Each card is `{headline, kind, status, track, platforms, badge, summary}` where `summary` is a ceiling of about 300 characters and is often much shorter (`platforms`, `badge` and `summary` are all optional). See the card-body rules in Step 7 before writing one.
  - `platforms` is any of `["ios","android","web"]` and renders as three fixed icon slots in the card corner, lit for the platforms the change lands on. It replaces the old track word chip on the Summary. Set it whenever a change is narrower than its `track`: an android-only redirect bug, an iOS-only layout fix. Leave it out and the renderer derives it from `track`, where Native means both phone platforms.
  - `track` is still required. Full report and the briefing use the words, and it is the fallback when `platforms` is absent.
- `user_facing[]` / `non_user_facing[]`: `{theme, prs:[{number, title, author, date, issue}]}`
- `milestones`: `{next_major:{name, issues:[{number, title, status, board}]}, next_web:{...}}` where status is one of `done | inprogress | backport | pending | closed` and `board` is `{dev, qa}` copied straight from `window.json`
- `needs_milestone[]`: `{number, title, resolved_by:[prNums], suggested, board}`
- `earlier_milestone[]`: `{number, title, resolved_by:[prNums], milestone}`
- `all_prs[]`: `{number, title, category:"user"|"non", theme, issue, author, date}`
- `prepared_commands[]`: the `gh issue edit` lines

Keep all prose plain and dash-free. The `summary` copy is for a non-technical reader. Confine raw PR titles to `all_prs` and the link lists.

## Step 9: Render and hand over

```bash
python3 <skill-dir>/scripts/render_report.py <report.json> <out.html>
```

Replace `<skill-dir>` with this skill's directory. The script writes the HTML, prints the briefing to stdout, and warns on stderr about em dashes, a missing `tracks` or `glance` block, and any summary copy over budget. Read the stderr and fix the JSON rather than shipping past a warning.

Then look at what you built, because the failure this report is prone to is invisible in the markup:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --screenshot=<run-dir>/screenshots/summary-dark.png --window-size=1280,1500 "file://<out.html>"
sed 's/data-theme="dark"/data-theme="light"/' <out.html> /tmp/light.html
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --screenshot=<run-dir>/screenshots/summary-light.png --window-size=1280,1500 "file:///tmp/light.html"
```

Read both images and apply the first-screen test from the altitudes section above. Chrome floors its window at 500 pixels wide, so a narrower `--window-size` crops the image and fakes an overflow that is not there. If product cards are not visible in the first 1500 pixels, something mechanical is still sitting above them: move it to the full report. Then:

1. Relay the briefing as the body of your reply, **including both blocks it prints after the `---` rules**. Those are the two asks, with their links already built:
   - **the cut decision**: what holding the release would actually buy, separated from what it would not. Milestone work with an open PR lands if you wait. Work with no code does not, so it either delays the release or rolls forward. It also carries the QA sign-off counts off the board, including anything sitting in a failed or blocked column.
   - **the milestone tagging**: issues resolved on master that carry no milestone, one link listing exactly that set, and a link each.
2. Give the path to the HTML on its own line so it is openable, and offer to open it.
3. Stop there and wait. Both asks are the user's call. Re-milestoning is one command once they answer, and answering badly on their behalf is expensive.

Verify before you claim. If you assert a fix is "in progress / not yet on master", confirm with `git branch -r --contains <sha>` rather than assuming. If you assert something is in production, name the ref you checked and how you know it is deployed.

## What good looks like

- Both tracks are pinned before any PR is read, with the right web baseline (the newest web tag **on master**, not the newest web tag), and the web window reduced by whatever later lineage tags already carried.
- Every milestone lookup used `state=all`, so the closed patch milestones are visible.
- Both scopes answered: the window off master, and a clear backport verdict.
- The resolver ran, so the PR-to-issue mapping is reproducible rather than hand-derived.
- The untagged-but-merged issues arrive as one decision with the reasoning already done, a single link that lists exactly that set, and a link per issue. Nothing is applied before the user answers.
- The roll-or-delay trade is stated honestly: what waiting buys, what it does not, and that the cut decides what is submitted rather than what ships, because QA runs after it.
- No issue is called outstanding on the strength of being open.
- Every issue riding the release carries both board columns, no `pending` survives a `Ready for Prod` column unreconciled, and the QA answer distinguishes passed from flagged from never triaged.
- The Summary's first screen is a claim, a sentence, the lanes and one line on the patch, with product cards visible without scrolling past mechanics. No sha, tag, branch, merge-base or PR number appears on that tab at all.
- The title and the lede name changes, not dates. No version number, day count or PR total appears in either.
- No lane is expanded unless a track is stuck in a way someone must act on this week. The emphasized stop is that blockage rather than a version number, and a build in review or a patch mid-cherry-pick shows as `in_flight` rather than as the grey footnote.
- The first product card sits within about 500 pixels. Past that, the hero has started narrating the schedule again.
- No card body restates its own chips, repeats its headline, says "Fixed", or reports a QA verdict. Cards with nothing to add are headline-only rather than padded to fill the budget.
- Every card body was written from a diff or a PR body rather than a title, and every sentence about machinery, above all about when a change takes effect, has a line of code behind it.
- Every feature card was checked against what gates it: the production flag values as served, the compiled-in defaults, federation config, and the platform derived from touched paths rather than from a parity note.
- The Summary reads like a product briefing a non-technical person understands at a glance, and every card says which track it lands on.
- The render was screenshotted in both themes and read before handing over, not just written.
- Nothing reads as "shipped" that is merely merged. No em dashes. Nothing is called a phone app.
