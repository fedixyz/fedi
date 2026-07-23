---
name: product-bug-report
description: >-
  Use when someone asks what is broken in the app, what bugs are we fixing, what issues users are hitting, or wants a bug report, backlog rundown, or known-issues list. Also use when they never say "bug" or "issue" and ask what is annoying users or what people are complaining about. Not for shipped work (product-activity-report) or what is queued for the next release (report-next-release).
---

# Product bug report

## Who this is for, and why that changes everything

The reader is a smart but non-technical person: a product lead, an operations manager, a founder. They will read this in Claude Desktop's code tab. They do not open terminals, read code, or know what "aws-lc" or "Appium coverage" means, and they should never have to.

So the job is not "list the open bug issues." It is the job a good product manager does when leadership asks *"what's currently broken for our users, and what are we doing about it?"* You read through the noise, you figure out what actually affects people, you say it in human language, and you keep it short.

A raw list of issue titles fails this person completely. Half the backlog is internal engineering work they cannot parse, and the other half is written in shorthand for the team. Your value is the translation and the curation, not the fetching.

## The one mental model that drives the whole report

**Organize the report around user-facing problems, not around GitHub issues.**

An "item" in your final list is *a thing a real person experiences in the app*. It might map to one issue, or to three issues that are really the same complaint, or to one big issue that causes two clearly different annoyances. You decide the grouping by asking: *would the reader think of these as the same problem?* Group by their mental model, not by how the engineering team happened to file tickets.

Keep the final list to **at most 10 items**. Fewer is fine and often better. This is a briefing, not an inventory.

## Step 1: Pull the recent-activity window

The backlog has well over a thousand open issues, so you never read all of them. Pull a window of the most recently active ones. Recency is how the team's current attention reveals itself, and it's the ranking the reader cares about. A bug last touched a year ago is, by definition, not what's hot.

```bash
gh issue list --repo fedibtc/fedi --state open --search "sort:updated-desc" --limit 80 \
  --json number,title,labels,updatedAt,createdAt,comments \
  --jq '.[] | "\(.updatedAt[0:10]) #\(.number) [\(.comments|length)c] {\([.labels[].name] | join(","))} \(.title)"'
```

Use `.comments|length` for the comment count, not `.comments`. The `comments` field is the full array of comment objects, so printing it raw dumps tens of kilobytes of bodies instead of a number.

`sort:updated-desc` is what makes "recent activity" real. An old issue that someone commented on yesterday correctly floats up, because the team is paying attention to it again.

## Step 2: Triage hard, because most of this window is not a user-facing bug

Read the window and throw out everything a real app user would never notice. In this repo the labels are an unreliable guide (genuine user-facing crashes often carry no bug label at all, and the `bug - *` labels are applied inconsistently), so decide by *reading*, using one test:

> **Would a person who only ever uses the app, and never touches code or a build, notice or care about this?**

If no, drop it. Things that almost always fail that test in this backlog:

- **Internal test/QA automation.** Titles like `[e2e audit] Add Appium coverage for ...`, anything tagged `e2e testing` / `testing` / `ai generated`. This is the team writing tests for themselves. Invisible to users.
- **Feature construction and epics.** `Build the fi-cli command-line tool`, `Implement the weighted guardian-fee split`, `Build bridge RPCs for setup`. These are *new things being built*, not *things broken for users*. A bug report is about what's broken, not the roadmap.
- **Developer-only and infra chores.** `tech debt`, `cicd`, `nix`, `devops`, `dx`, dependency bumps, "symbol missing from dev build", flaky-test fixes, refactors. Real for engineers, meaningless to the reader.
- **Pure internal ops tasks.** "Get Unilorin Spaces numbers", "Deploy a LNv2 gateway."

Keep the things a user actually feels: crashes, payments or balances behaving wrong, money getting stuck, chat misbehaving, notifications misfiring, confusing or broken screens, data shown incorrectly. When you are unsure, lean on whether the issue body and comments describe a *user* hitting something versus a *developer* needing something.

For the dozen or two that survive, read the real context, because the body and the comments are where the human framing lives (often an engineer has already explained, in plain terms, what's happening and whether a fix exists):

```bash
gh issue view <number> --repo fedibtc/fedi --comments
```

This read is also where the status comes from. A linked or merged pull request, a "this will ship in the next build" comment, or a QA-notes comment tells you whether something is still open, being looked into, or already fixed and waiting to release. The recent-activity window alone won't show linked PRs, so trust the comments here. When you genuinely can't tell, stay conservative and say "Being looked into" rather than claiming a fix.

## Step 3: Translate to what the user feels

For every surviving item, rewrite the engineering title into the symptom a person would describe. Strip the platform jargon, keep the human consequence. Some real examples from this very backlog show the altitude:

| Engineering title | What the reader should see |
| --- | --- |
| `App crashes for iOS 15 versions` (a missing CPU instruction on old chips) | **The app won't open for some people on older iPhones** (their money and data are safe, it's a device limitation, fix in progress) |
| `Reject option missing from ecash request in chat` | **You can't decline a payment request someone sends you in a chat** |
| `Some DM rooms show group-room icon in chat list` | **Some one-on-one chats show the wrong icon** |
| `No in-app recovery for a funded but unclaimed Lightning receive` | **In a rare case, money sent to you over Lightning can get stuck, with no way to get it back from inside the app** |
| `iOS 15 symbol missing from dev build` | *(dropped: only affects engineers building the app)* |
| `[e2e audit] Add Appium coverage for reclaim flow` | *(dropped: internal testing)* |

Notice the pattern: name the symptom, name who feels it, and say whether it's understood / being fixed. Reassure where the truth allows ("money is safe"), because a non-technical reader's first fear is usually "is this dangerous?"

## Step 4: Cluster and rank

**Cluster** the translated symptoms into the final items using the mental-model test from above. If two issues are the same felt problem, make them one item that cites both. If one issue produces two genuinely distinct user experiences, it's fine to surface both, or to keep it as one item that mentions both effects, whichever reads more honestly.

**Rank** by recent activity, most recent first. That ordering is the spine of the report and what the reader expects. Let real severity nudge things, so a crash or stuck-funds problem can sit above a cosmetic glitch even when the glitch was touched a little more recently, because a briefing leads with what hurts. Do not let an old, quiet issue jump to the top just for being severe. If it were urgent it would be active. For a clustered item, use the most recent activity among its issues as the item's recency.

Expect timestamp ties. A bulk label or migration edit can stamp dozens of issues with the same `updatedAt`, collapsing a big chunk of the window onto one date so the sort can't separate them. When that happens, break ties with the real signals of attention: the date of the latest actual comment, how much discussion an issue has drawn, and severity.

## Step 5: Build the report JSON

Write a JSON file capturing your synthesis. This is the only hard, judgment-heavy artifact you produce. A bundled script turns it into both outputs so the quick list and the rich report can never disagree.

Everything the HTML shows beyond the flat list, the summary tiles and the by-status view, is computed from these same fields. Nothing extra is asked of you, so spend your effort on the judgment and let the renderer do the presentation.

Get a scratch home first, so the artifacts land somewhere durable rather than in `/tmp`:

```bash
scratch new product-bug-report "plain-language bug report for product"
```

That prints a run dir with `files/`, `reports/` and `screenshots/`. Write the JSON to `files/fedi-bug-report.json`:

```json
{
  "generated_at": "2026-06-26",
  "repo": "fedibtc/fedi",
  "intro": "A plain-language snapshot of what's currently affecting people in the app, most recently active first.",
  "items": [
    {
      "headline": "The app won't open for some people on older iPhones",
      "impact": "Crash",
      "who": "A small number of users on iPhone 7 and older devices",
      "status": "Fix in progress",
      "last_active": "2026-06-25",
      "summary": "People on older iPhones can see the app crash the moment they open it. Their money and data are safe, it's a limitation of the older phone's chip, and a fix is already in progress.",
      "detail": "The crash happens on the very first launch on devices older than the iPhone 8, because the app shipped an instruction those older chips don't support. Reinstalling or restoring from backup won't help. A fix that rebuilds the app to avoid that instruction is in review.",
      "issues": [
        {"number": 11601, "title": "App crashes for iOS 15 versions", "url": "https://github.com/fedibtc/fedi/issues/11601"}
      ]
    }
  ]
}
```

Field guide:
- `impact` is the feature area the reader is being told about, and it becomes the first chip: an icon plus a word, so someone scanning ten cards can tell money from chat from a crash without reading. Use one of `Crash`, `Funds`, `Payments`, `Chat`, `Sync`, `Backup`, `Recovery`, `Notifications`, `Display`, because those are the ones with an icon. Anything else still renders, just neutral and iconless, and the script warns you on stderr.
- `status` is load-bearing, not decoration. It decides which bucket the item lands in in the by-status view, so it has to be exactly one of `Open`, `Being looked into`, `Fix in progress`, `Fixed, pending release`. Infer it from the issue state, linked PRs, and the latest comments, and never overstate it. `Fixed, pending release` is the strongest claim in the report, because it tells the reader this one costs nothing more to solve, so only use it when a fix is actually merged. When a fix is merged but a follow-up is still open, that is still `Fixed, pending release` for the main problem, with the loose end explained in `detail`.
- `who` is the human answer to "should I worry?": who is hit and how broadly.
- `summary` is what shows in the quick list: one or two calm, jargon-free sentences.
- `detail` is the expandable section in the HTML: a bit more depth, still readable, including whether data/funds are safe and what the fix is.

The line between `summary` and `detail` is the most valuable judgment in the whole format, so hold it where it is. `summary` answers "what is happening to people and should I worry", and it has to stand alone, because it is what lands in the chat. `detail` answers "why, and what happens next", and it is the only place a mechanism, a device model, or a caveat belongs. Resist moving material up to make the card look richer, and resist pushing reassurance down: a reader who only sees the summary must never come away more worried than the facts justify. Whatever you claim in `summary` also has to survive `detail`. A summary that says money is safe, above a detail conceding it can be lost, destroys trust in every other item on the page.
- `issues` is how the reader reaches the real engineering detail. Always include at least one, with the correct full URL (`https://github.com/fedibtc/fedi/issues/<number>`). The `title` here is the raw GitHub issue title, and that's fine, because it shows only inside the reference link, which is a pointer to the source, never the report speaking. Keep all jargon confined to it. Real titles often contain an em or en dash, so swap any for a regular hyphen as you copy them in, otherwise the file write can be rejected.

## Step 6: Render, check your own render, and hand it over

Run the bundled renderer. It writes the HTML report and prints the inline briefing to stdout:

```bash
python3 "<skill-dir>/scripts/render_report.py" \
  files/fedi-bug-report.json \
  "reports/fedi-bug-report-$(date +%F).html"
```

Replace `<skill-dir>` with this skill's own directory (the base directory shown when the skill loads). Read anything it prints to stderr: those warnings mean a status or impact value fell outside the vocabulary, which silently changes where an item lands.

Then audit your own render rather than trusting the markup:

```bash
"<skill-dir>/scripts/check-report.sh" "reports/fedi-bug-report-$(date +%F).html"
```

It asserts the mechanical failures (page weight, external assets, long dashes, every card carrying an issue link, no sideways scroll) and writes four screenshots: light, dark, narrow, and the by-status view. **Look at them.** The script cannot tell you whether a chip is legible or whether the buckets actually read as buckets, and this report gets forwarded to people who will never ask you to fix it.

It exists to keep you out of two traps. Headless Chrome follows the host OS theme and ignores the flags that claim to override it, so an unchecked light and dark pair are often the same picture. It also floors its layout viewport at 500px while still cropping the image to whatever narrower size you asked for, which looks exactly like a page bleeding off the right edge when nothing is wrong.

Then present it to the reader like a person, not a tool:

1. Relay the inline briefing (the script's stdout) as the body of your reply. That is the at-a-glance list they wanted.
2. Below it, offer the richer report in one friendly line and give the link, for example:

   > Want the fuller picture? I put together a visual report where you can expand each item for more detail, or flip it to group by status to see what is already fixed:
   > [Open the full report](file:///Users/you/.agent-scratch/fedi/<run>/reports/fedi-bug-report-2026-06-26.html)
   > (If the link doesn't open, the file is at: /Users/you/.agent-scratch/fedi/<run>/reports/fedi-bug-report-2026-06-26.html)

   Use the real absolute path you wrote, with the `file://` prefix. Include the plain path on its own line too, because some chat interfaces won't make a `file://` link clickable, and the reader should still be able to find the file.
3. Fill in the run's `manifest.md`: what each artifact is and the outcome. Note anything that shaped the ranking and would otherwise be relearned from scratch next time, such as a bulk edit collapsing a chunk of the window onto one timestamp.

## What the HTML gives the reader that the chat list can't

The briefing is one ordered list, which is the right shape for "what should I know". The page adds two things that only work visually, and both are computed, so they cost you nothing:

- **A count strip above the list.** Four tiles, one per status, so before reading a single item the reader knows how much of this still costs engineering time and how much is already paid for. This sits *above* the at-a-glance layer rather than displacing it.
- **A by-status view.** The same cards regrouped into buckets ordered by how much work is left, ending with "Done, waiting on a release". That last bucket is the one people most want pulled out, because it is the only one where the answer is ship, not staff. Clicking a tile jumps straight to its bucket, and each bucket has its own link so a reader can send someone directly to it.

This is why `status` accuracy matters more than it looks. A wrong status doesn't just mislabel a card, it moves work between "needs attention" and "already handled", which is the decision the reader is actually making.

## What this borrows from the visual-report skill, and what it deliberately doesn't

If you know `visual-report`, apply its instincts here but not its structure, because the two have different jobs.

Worth taking:

- Orient before you detail. Here that is the count strip and the one-line shape statement, not a wall of items.
- Make the top line state a finding, not a topic.
- Keep the page self-contained, dated, and readable in both themes.
- Own the render loop instead of trusting the markup.

Deliberately not taken:

- **No hero diagram.** There is no system to draw. The honest picture of a bug list is its status distribution, and the count strip shows that better than any SVG would. A diagram here is decoration, and decoration on a page about what is broken reads as spin.
- **No restructuring into altitudes.** Each card already descends: headline, chips, summary, then the fold. That per-item hierarchy is doing the work; a document-level one on top of it would just add scrolling.
- **Do not follow its "give the gist and a link, never dump the report into the terminal" rule.** That rule is right for a walkthrough and wrong here. In this skill the inline briefing *is* the deliverable, the thing the reader asked for and often the only thing they read. The HTML is the optional deeper cut. Relay the full briefing every time.

## What good looks like

- A reader who knows nothing technical comes away understanding what's currently shaky in the app and roughly how worried to be.
- Every item is a felt experience, phrased the way the reader would describe it to a friend.
- Nothing internal leaks into the report's own voice. Headlines, summaries, and details carry no jargon and no label names (no "bridge", "RPC", "Appium", "e2e", "ecash", "symbol", "build"). Raw engineering titles are allowed to appear only inside the underlying-issue reference links.
- The list is short (<= 10), ordered by what's active and what hurts, and every item offers a way to dig deeper.
- The quick list and the HTML say the same thing, because they came from the same JSON.
- Every `summary` survives its own `detail`. Nothing reassuring on the face is retracted behind the fold.
- The by-status view answers "what still needs people on it" in one glance, and the reader can trust the "done" bucket literally, because nothing landed there without a merged fix.
- You looked at the screenshots before handing it over.
