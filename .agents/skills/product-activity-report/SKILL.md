---
name: product-activity-report
description: >-
  Report GitHub product activity in plain language: what is moving in the product across a repo's pull requests and issues (features being built, fixes landing, improvements shipping), ranked by recent activity and written so a non-technical reader (product, ops, leadership) understands it at a glance. ALWAYS use this when someone asks for product activity, a product activity report, product activity on GitHub, GitHub activity, repo activity, or what the GitHub activity says about the product, for one repo or several. Equally, use it when they never mention GitHub at all and ask what is the team working on, what's new, what shipped, what changed recently, what's coming, or want a "product update", "activity summary", "recent work rundown", "what's happening" or "what have we been up to" overview. Covers shipped, in-progress, and planned work, not just bugs. Verifies what is genuinely live per platform (native and web release separately) instead of assuming a merge means shipped. Handles repos whose product has not launched yet. Filters out developer-only work with no user impact. Produces a quick inline list plus a richer linked HTML report. Reach for it instead of dumping raw PR or issue titles.
---

# Product activity report

This is the broader sibling of the `product-bug-report` skill. That one answers "what's broken." This one answers "what's moving in the product" across everything: new features, fixes, and improvements, whether they just shipped, are being built, or are planned. If the request is specifically and only about bugs, prefer `product-bug-report`. If the request is specifically about the contents of the next release cut, prefer `report-next-release`.

## Who this is for, and why that changes everything

The reader is a smart but non-technical person: a product lead, an operations manager, a founder. They do not open terminals, read code, or know what "feature flag" or "Appium coverage" means, and they should never have to.

So the job is not "list the recent PRs and issues." It is the job a good product manager does when leadership asks *"what's the team actually getting done for our users?"* You read through the noise, you figure out what actually changes the product for people, you say it in human language, and you keep it short.

A raw list of PR titles fails this person completely. Most of the activity in a repo is internal: tests, build tooling, refactors, release plumbing. Your value is the translation and the curation, not the fetching.

## The one filter that defines this report

Everything hangs on a single test, applied to every piece of activity:

> **Does this change what a person experiences in the app, or what the product can do for them?**

If yes, it belongs. If it only helps the engineers (faster builds, cleaner code, more test coverage, easier local development, smoother releases), that is *developer experience*, and it stays out, no matter how much effort it represents.

The trap is judging by category or by the commit prefix. `feat(...)` does not mean user-facing, and `fix`/`build`/`test` are not automatically out. Judge by impact:

- `feat(nexus): multi-build launcher for on-device branch testing` is a `feat`, but it's a tool *for the team* to test branches. Pure developer experience. **Out.**
- `feat(common): add personal backup reminder feature flag` is the internal switch behind a user feature. On its own it's plumbing. **Fold it into the user-facing feature it enables, don't list it alone.**
- `test: double integration testTimeout to absorb flake` is the team fixing their own test suite. **Out.**
- `feat: add manual lightning receive reclaim` gives users a button to recover stuck money. **In.**
- `fix(ios): pin device bridge to apple-a7` stops the app crashing on older iPhones. A `fix`, deeply user-facing. **In.**

The one nuance worth holding: an infrastructure or performance change *can* be user-facing if users feel it. "Make the app start 2 seconds faster" or "stop dropping notifications" counts, because the user experiences the result. "Speed up CI" or "cache the dev-fed build" does not, because only engineers feel it. Always ask whether the *user* feels the result, not whether the work was important.

## The mental model for items

**Organize the report around product changes, not around tickets.**

An "item" is *a thing that changed or is changing for users*. One feature usually spans several PRs and an issue (the flag, the native screen, the web parity, the e2e test). Cluster those into one item that cites the relevant ones. Equally, one PR might be worth splitting if it delivers two genuinely distinct user-facing wins. Group by how the reader thinks, not by how the work was filed.

Keep the final list to **at most 10 items**. Fewer is fine. This is a briefing, not a changelog.

## Step 1: Establish scope and read the repo's altitude

The repo is not always `fedibtc/fedi`. Take it from the request, defaulting to `fedibtc/fedi` when nobody names one, and set it once so the rest of the run is a substitution rather than six chances to typo a repo name:

```bash
REPO=fedibtc/fedi
REPO_PATH=~/fedibtc/fedi   # a local clone, needed for the release checks in Step 4
git -C "$REPO_PATH" fetch --tags origin --quiet
```

Fetch the tags before anything else. A local clone that is a few days stale is missing the newest release tag, and every release check in Step 4 then quietly answers against the wrong baseline, reporting shipped work as unreleased. This failure is silent, which is what makes it worth one command up front.

**Several repos in one request produce one merged report, not one report each.** The reader thinks in terms of "the product", not "the codebases", so a single ranked list is what they asked for. Run Steps 1 through 4 per repo, then merge the surviving items into one ranking and tag each item with the repo it came from. The renderer shows a repo chip on every card as soon as the report spans more than one, and stays quiet when it doesn't.

Before triaging, work out which kind of repo you are in, because it changes what "shipped" can even mean:

- A **shipped product** repo has release tags and users today. `fedibtc/fedi` is one. Statuses run the full range from `Planned` to `Shipped`.
- A **pre-product** repo has no release tags, often no open issues, and nothing in anyone's hands. `fedibtc/decentralized-federations` is one. See "When the product hasn't launched yet" below before you triage, because the standard filter deletes the entire report otherwise.

The `shipped_status.py` script in Step 4 tells you which you are in on its first line.

## Step 2: Pull the activity windows

Activity lives in three places, so pull three windows. Merged PRs are what *landed*, open PRs are what's *in flight*, and recently touched issues are what's *reported or planned*.

```bash
# Landed: recently merged pull requests
gh pr list --repo "$REPO" --state merged --search "sort:updated-desc" --limit 40 \
  --json number,title,labels,mergedAt \
  --jq '.[] | "MERGED \(.mergedAt[0:10]) #\(.number) {\([.labels[].name]|join(","))} \(.title)"'

# In flight: open pull requests (note drafts)
gh pr list --repo "$REPO" --state open --search "sort:updated-desc" --limit 30 \
  --json number,title,labels,updatedAt,isDraft \
  --jq '.[] | "OPEN-PR \(.updatedAt[0:10]) #\(.number) draft=\(.isDraft) {\([.labels[].name]|join(","))} \(.title)"'

# Reported or planned: recently active open issues
gh issue list --repo "$REPO" --state open --search "sort:updated-desc" --limit 40 \
  --json number,title,labels,updatedAt,milestone,comments \
  --jq '.[] | "ISSUE \(.updatedAt[0:10]) #\(.number) [\(.comments|length)c] m=\(.milestone.title // "-") {\([.labels[].name]|join(","))} \(.title)"'
```

Use `.comments|length` for the comment count, not `.comments`. The `comments` field is the full array of comment objects, so printing it raw dumps tens of kilobytes of bodies instead of a number. For the same reason, read bodies with `gh pr view <n> --json body --jq .body` rather than interpolating them into a `--jq` string, where a quote in the body breaks the expression.

An empty issue window is information, not a failed command. It usually means a pre-product repo where all the thinking happens in pull requests.

`sort:updated-desc` is what makes "recent activity" real, but the three windows have different reach: the same `--limit` on a busy merged-PR stream might cover ten days while the issue stream covers two months. That matters, because an item's rank depends on a date whose meaning shifts between streams.

So fix a window explicitly rather than inheriting whatever the limits happen to produce. Note the oldest date each stream reached, take the newest of those three as the report's horizon, and drop anything older. Then say the horizon out loud in the intro ("activity since 11 July"), because a reader who knows the window will not read an absence as "nothing is happening there".

A bulk label or migration edit can also stamp many items with the same date, collapsing part of a window onto one timestamp. When that happens, break ties with real signals of attention: the latest actual comment, how much discussion something drew, and how big the user-facing impact is.

## Step 3: Triage to user-facing impact

Run every item through the filter above and drop everything that fails it. The things that almost always fail:

- **Internal tests and QA automation.** `test(e2e): ...`, `[e2e audit] ...`, anything tagged `e2e testing` / `testing` / `ai generated`.
- **Build, release, and CI plumbing.** `build(e2e): cache the dev-fed build`, `Backport/26.x`, dependency bumps, `nix`, `cicd`, `devops`.
- **Agent and workflow bookkeeping.** `[aw] Daily E2E Coverage Check failed` and its siblings are a robot filing tickets about itself.
- **Developer tooling.** On-device branch launchers, command-line tools for the team, local-dev helpers. These are `feat`s but they serve engineers, not users.
- **Docs and internal refactors.** `docs(...)`, `tech debt`, pure restructuring with no behavior change.
- **Internal plumbing for a user feature.** Feature flags, selectors, bridge RPCs. Don't list these on their own, fold them into the user-facing feature they serve.

Keep features, fixes, and improvements a person would notice: new capabilities, things that used to be broken and now work, things that got faster or clearer or more reliable.

Two hard cases are worth a rule. Infrastructure that only *might* reach users (a dependency bump, a backend gateway, faster flag delivery) stays out unless it directly unblocks a specific user feature you can name. And for a big multi-issue epic where only one slice is user-facing, represent it once by its user outcome and cite that slice, not the engineering scaffolding.

**Keep a running note of what you dropped and why.** Not for the report, which stays clean, but for the handover: the reader's most common question is "why isn't X in here?", and a one-line answer beats re-deriving it. Two or three sentences at the end of your reply is the right size.

For the survivors, read the real context. The body and comments carry the human framing and, crucially, the status.

```bash
gh pr view <number> --repo "$REPO" --comments
gh issue view <number> --repo "$REPO" --comments
```

## Step 4: Decide what is actually live

`status` answers one question only: **does a user have this yet?** Getting this wrong is the fastest way to lose the reader's trust, because they will read "Shipped" as "I can open the app and use it right now" and go look.

Four gates stand between a merge and a user, and the answer is per platform, because native and web clear them independently:

1. **Merged.** An open PR is `In progress`, however finished it looks.
2. **Contained in what is actually deployed on that platform.** Merged to master is not released, and tagged is not deployed. This is the gate people skip.
3. **Its production flag is on**, if the work is gated by one.
4. **The feature's own code is in that deployed build**, not just its flag. This is the gate people skip *after* learning about gate 3.

For gates 2 and 4, run the bundled script rather than eyeballing merge dates against tag dates, which is where hand analysis goes wrong:

```bash
python3 "<skill-dir>/scripts/shipped_status.py" --repo "$REPO" --repo-path "$REPO_PATH" 11596 11722 10713
```

It prints, first, what users are actually running on each platform and how it knows, then per item whether that work is contained in each of those refs, ending with a `live on:` verdict naming the platforms. Its first line tells you whether the repo has shipped at all.

Three things about this repo's release model make the naive version of this check wrong, and the script exists because each one silently produces a confident false answer.

**Nothing deploys itself, so the newest tag is not what users are running.** Web production is a manual `workflow_dispatch` of `vercel-prod.yml`, and the `Production` environment only accepts a `web/*` ref of type tag, so a branch is rejected before any build runs. A `web/26.7.0` tag can therefore sit in the repo indefinitely without a single user seeing it. The deployed ref is whichever one the last *successful* production run used, and the native equivalent is the latest published GitHub release. The script asks the deploy rather than the tag list, and when it has to fall back to newest-tag it labels that ref `NOT confirmed deployed` so a guess never gets reported as fact.

**Release lineages are cut from the previous release tag, not from master.** A web release is the last `web/X.Y.Z` tag plus only the specific commits intended for it, cherry-picked. Master is never deployed, so "merged to master" carries no information about liveness at all, and a change can sit merged for months while releases go out around it. It also means containment is not ancestry: the master-side merge commit is not an ancestor of the release tag, and a naive `git merge-base --is-ancestor` says "no" for work that plainly did ship. The script checks ancestry, then the PR number, then the PR title in commits reachable from the ref, which is what finds a change listed inside a squashed backport commit, and prints which method answered.

**Native and web are independent products for this purpose, so parity is a fact you check, never one you assume.** They are cut on different schedules by different people, so an item is routinely live on one and absent from the other, and neither direction is the default. The script's `live on:` line is the answer. Carry it into the report: the status chip has one slot, so give it the platform where most users are, and make the summary's first sentence say the split in plain words, as in "live on the phone; reaching the web app with its next release". A reader who is told "it's live" and then cannot find it on the surface they use has been told something false, and that is the mistake they remember. When an item is live on neither, it is `Merged, pending release` no matter how long ago it merged.

For gate 3, read the real production values, never infer them from a merge:

```bash
curl -s https://app.fedi.xyz/api/features   # what production serves users right now
```

**A flag being on tells you the switch is on, not that the thing it switches exists in the build people are running.** This is the trap that survives every check above, because the evidence looks conclusive. Flipping a flag is its own tiny PR touching two files, and because releases are cherry-picked it is routinely the *only* thing pulled into a release, while the screens that read the flag stay on master. Containment then confirms the flag PR shipped, the endpoint confirms the flag is on, and both are true while the feature is invisible to that platform's users. The script flags this for you: any `cherry-picked` verdict comes with a reminder to check the code, precisely because a lone flag flip is the most common thing to be cherry-picked.

So before calling anything `Shipped` on a platform, confirm that platform's deployed ref contains the feature itself, not just its switch:

```bash
git grep -l '<a symbol from the feature itself>' <deployed-ref> -- ui/web/src   # or ui/native, crates/
```

Real case, worth internalizing because it defeated every cheaper check: `privateRoomKnocking` is `true` in production, and the flag-flip PR is contained in the deployed web ref. Both signals say live. Yet that ref has **zero** knocking code under `ui/web/src`, where master has six files of it, because only the flip was cherry-picked. The feature is live on phones and absent from the web app. A report trusting the flag alone calls it live on both, and is wrong on the half of the audience that uses the web app.

The endpoint is otherwise the truth, and it is served by the *deployed* web app, so it can lag `master`. That lag is itself a useful signal: a flag key present in `ui/web/src/pages/api/features.ts` but **missing entirely** from the endpoint's response means production is running an older web build than master, and anything newer than that build is definitely not live. Note that the flag name changes shape between layers, so match on meaning rather than string equality: the endpoint says `privateRoomKnocking` while the code that consumes it reads `selectFeatureFlag(s, 'private_room_knocking')`. Grep the snake_case form to find what the flag actually gates.

Milestones sharpen the vaguer statuses. An issue tagged for the next version is `Planned` with a date you can name ("scheduled for the 26.7 release"), which is far more useful to the reader than `Planned` alone. An issue with no milestone and no PR is genuinely just `Being looked into`.

The resulting vocabulary:

| status | what it means |
| --- | --- |
| `Shipped` | All four gates cleared on that platform. The reader can go use it. |
| `Merged, pending release` | Merged, but not in a cut release yet. Use it for features and improvements as readily as for fixes. |
| `In progress` | Open PR, or merged behind a flag that is off in production. |
| `Planned` | An issue with no code yet, usually milestoned. |
| `Being looked into` | Reported, acknowledged, nobody assigned yet. |

Two rows show the altitude, and they are the whole lesson:

| The work | What the reader should see | kind / status |
| --- | --- | --- |
| a chat feature, merged, in the shipped web tag, its flag on in prod | **You can react to chat messages with emoji** | New feature / Shipped |
| a wallet-safety feature, merged, but its flag is absent from what prod serves | **A backup reminder is coming so you don't lose access to your funds** | New feature / In progress |

Same merge state, opposite user reality, opposite status. These two are illustrations of the reasoning, not current work. Check the live windows rather than expecting to find them.

When you cannot confirm something is live, it is not shipped. Stay conservative, and reassure where the truth allows, because a non-technical reader's first question about anything money-related is "is this safe?"

## When the product hasn't launched yet

Some repos are building something real that nobody can use yet: no release tags, no open issues, every pull request a spec or a protocol or a daemon. Run the standard filter there and you delete the report, because literally nothing changes what a person experiences in the app today.

An empty report is a worse answer than no report. The work is real and the reader wants to know what it is buying them. So raise the altitude by one level: instead of *"what changed for users"*, report *"what capability is being built, and how far along is it"*.

Three things make this honest rather than hype:

- **Say up front that nothing is in users' hands.** Put it in the report's intro, not buried in a card. The reader must never mistake this for a shipped-work report.
- **Lead with the user outcome, not the component.** "New federations will start with enough liquidity for payments to work" is the item. "FLIP liquidity manager MVP" is the implementation detail that goes in the links.
- **Be specific about how early it is.** "The first version is written and running against the project's own test setup" is useful. "Coming soon" is not. Every status is `In progress` or `Planned`, and `Shipped` never appears.

The same curation still applies to CI, agent tooling and dev harnesses, which drop out as they always do. Design documents are the exception worth thinking about, and the one place the general rule misleads. In a shipped-product repo a `docs(...)` PR describes work that exists elsewhere, so dropping it loses nothing. In a pre-product repo the signed-off design is frequently the *only* artifact a capability has, and dropping it deletes real decided work from the report. So judge a design document by the same impact test as anything else: if it commits the project to a capability you can state as a user outcome, it earns an item at `Planned`, cited to the document. If it is a refinement of a capability already covered, or process and convention housekeeping, it still drops.

What should survive is the four to seven workstreams a person outside the team would recognize as capabilities.

## Step 5: Cluster and rank

**Cluster** related work into single items using the mental-model test. A feature delivered across a flag PR, a native PR, a web PR, and an issue is *one* item citing all of them. Clustering crosses repo boundaries too: when work in one repo delivers a capability designed in another, it is one item citing both, and its `repo` field is the list of both.

Resist one temptation here. When you have twelve candidates and a cap of ten, merging two unrelated items to fit is the wrong lever, because it hides a real thing behind a headline that does not describe it. Drop the two weakest instead, and say so in the drop note. Clustering is for work that shares a user outcome, not for making the arithmetic work.

An item's `last_active` is the most recent activity across everything you clustered, including supporting work, because the question the date answers is "is anyone actually on this?". When that most recent touch was internal, say so in the detail rather than implying a user-visible change landed that day.

**Rank** by recent activity, most recent first. That ordering is the spine and what the reader expects.

Impact may nudge an item up, but bound the nudge to about three positions. Unbounded, "impact" quietly becomes "what I found most interesting", and the reader loses the one guarantee the ordering gives them. If something genuinely deserves the top and recency will not carry it there, it is usually because it just went live, in which case say that in the summary and let it sit where the date puts it.

A healthy report mixes statuses, so it reads as momentum rather than a dump. In a pre-product repo that mix is not available and should not be manufactured. There the momentum comes from being specific about how far each capability has actually got.

One warning about recency: a feature that has been live for months but whose only recent activity is internal cleanup is not news. Fold the cleanup in, and leave the item out unless something about it genuinely changed for users.

## Step 6: Build the report JSON

Write a JSON file capturing your synthesis. This is the only judgment-heavy artifact you produce, and a bundled script turns it into both outputs so the quick list and the rich report can never disagree.

Put it in a scratch run directory rather than `/tmp`, so the artifacts survive and stay findable:

```bash
RUN=$(scratch new product-activity-report "activity report for $REPO")
```

Write the JSON to `$RUN/files/activity-report.json`:

```json
{
  "generated_at": "2026-07-22",
  "title": "What's moving in the product right now",
  "repo": "fedibtc/fedi",
  "intro": "A plain-language snapshot of what's moving in the product: what just shipped, what's being built, and what's planned. Most recently active first.",
  "items": [
    {
      "headline": "You can react to chat messages with emoji",
      "kind": "New feature",
      "status": "Shipped",
      "repo": "fedibtc/fedi",
      "who": "Anyone using chat, on a phone or on the web app",
      "last_active": "2026-06-23",
      "summary": "You can now add emoji reactions to messages in chat. It's live for everyone, including on the web app.",
      "detail": "Reactions are turned on in production, so this is genuinely live for users, not just merged. Tap and hold a message, or use the reaction button, to add an emoji.",
      "links": [
        {"number": 11590, "title": "feat(web): enable message reactions in production", "url": "https://github.com/fedibtc/fedi/pull/11590", "type": "pr"},
        {"number": 10437, "title": "feat: add message reactions across chat rooms", "url": "https://github.com/fedibtc/fedi/issues/10437", "type": "issue"}
      ]
    }
  ]
}
```

Field guide:
- `title` sets the page heading and browser tab. Default it to "What's moving in the product right now", and change it when the report is not about a shipped app, for example "What we're building" for a pre-product repo.
- `repo` at the top level is a string, or a list when the report spans several. The per-item `repo` is what tags each card, and it only renders when the report spans more than one, so it is safe to always include. An item genuinely spanning repos takes a list there too, and its chip names both.
- In a multi-repo report the renderer qualifies every reference as `repo#number`, because `#84` and `#11748` side by side otherwise look like numbers from the same project. That happens automatically from the link URLs, so keep the URLs correct and do not hand-prefix anything.
- `kind` becomes a colored chip: `New feature`, `Improvement`, or `Fix`.
- `status` becomes a colored chip, from the vocabulary in Step 4.
- `who` is the human answer to "does this affect me?": who benefits or is hit, and how broadly.
- `summary` is what shows in the quick list: one or two calm, jargon-free sentences.
- `detail` is the expandable section in the HTML: a bit more depth, still readable.
- `links` is how the reader reaches the real engineering detail. Issue URLs use `/issues/<n>`, pull-request URLs use `/pull/<n>`. The `title` is the raw GitHub title, which is fine, because it shows only inside the reference link and never in the report's own voice. Keep all jargon confined to it. Real titles often contain an em or en dash, so swap any for a regular hyphen as you copy them in, otherwise the file write can be rejected.

## Step 7: Render both outputs and hand them over

Run the bundled renderer. It writes the HTML report and prints the inline briefing to stdout:

```bash
python3 "<skill-dir>/scripts/render_report.py" \
  "$RUN/files/activity-report.json" \
  "$RUN/reports/activity-report-$(date +%F).html"
```

Replace `<skill-dir>` with this skill's own directory (the base directory shown when the skill loads).

Then present it to the reader like a person, not a tool:

1. Relay the inline briefing (the script's stdout) as the body of your reply. That is the at-a-glance list they wanted.
2. Below it, give the report path with a `file://` prefix and again as a plain path on its own line, because some chat interfaces won't make a `file://` link clickable.
3. Add the two or three sentences on what you dropped and why.

## What good looks like

- A non-technical reader comes away knowing what the team shipped, what's coming, and why it matters to users.
- Every item is a real product change, phrased the way the reader would describe it to a friend.
- Nothing developer-only leaks into the report's own voice. Raw engineering titles show only inside the reference links.
- The list is short (<= 10), ordered by recency with only a bounded nudge for impact, and the covered window is stated so an absence reads as an absence rather than as silence.
- `Shipped` survived all four gates: contained in what is actually deployed, flag on in production, and the feature's own code present in that deployed build. Every claim of liveness is one you checked, not one you inferred from a merge, not one a naive ancestry test talked you out of, and not one a lone flag flip fooled you into.
- Parity is stated, never assumed. Where native and web differ the summary says so in plain words, because a reader told "it's live" who then cannot find it on the surface they use has been told something false.
- A pre-product repo produces a real report about what is being built, with its unlaunched state declared in the intro.
- Several repos produce one merged, repo-tagged ranking rather than several disconnected reports.
- The quick list and the HTML say the same thing, because they came from the same JSON.
