---
name: write-pr
description: Use when writing GitHub PR descriptions that should match this writer's PR style.
user-invocable: true
---

# Write PR Skill

PR descriptions are terse and reviewer-oriented. The diff carries the meaning; the description adds the context the reviewer can't see.

The reader must understand what the change *does for the user, the team, or the system* before they have to recognize any code identifier. They also lack the context you have: they never saw the prior state and weren't in the conversation that produced the change, so a descriptor that only means something by contrast to what the code used to be ("chat-agnostic", "decoupled from X", "now generic", "standalone") reads as a non-sequitur, and it drags in the very thing you claim independence from. Name what the thing is and does, standalone. Demonstrate an absence by its absence: a harness unrelated to chat shows it by a title that simply never says "chat". Describe behavior in prose first; cite identifiers only when they help the reviewer locate something in the diff. A description that reads like a tour of internal field names, file paths, and call chains has lost the reader before they reach the diff.

> This skill is paired with prose-style. After drafting the description and before reporting back, invoke prose-style. Required.

## Scratch file

Draft into `tmp/<issue>.md` at the repo root and publish from there, staying inside the project's auto-approved paths so nothing prompts:

- draft and revise with the `Write` tool, overwriting the same path. that dir is gitignored and inside the repo, so `Write` is auto-approved there. system `/tmp` or any path outside the repo is not
- never write the markdown with shell redirection (`>`, `>>`, heredoc), and never `rm` a draft - both prompt. overwriting in place with `Write` needs neither
- publish with `gh pr create --body-file tmp/<issue>.md` or `gh pr edit <n> --body-file tmp/<issue>.md`, never an inline `--body`

## Core sequence

Default sequence:

1. If the PR is reactive to a problem (build break, error, regression), state the symptom from the reader's POV first, in plain language - the way you'd describe it at standup. Otherwise, state what changed.
2. State the change (or the fix, if you led with the symptom)
3. Add only what a reviewer cannot derive by reading the diff. Restating what you implemented - file layout, type shapes, config values, the mechanics of the approach - duplicates the diff rather than adding context, even when those details feel interesting or non-obvious
4. State what was tested

If the title and diff already say most of it, keep the description short.

## Lead with the symptom

When the change exists because something is broken, the reviewer's first question is "why does this PR exist?" Answer it in the first sentence by stating the symptom in plain reader-POV language, the way you'd describe it to a teammate at standup.

Reactive PRs:

- "When you update to `Xcode 26.4` and run `pod install`, you get a build error."
- "Long-press on iOS stopped opening the menu after the react native upgrade."

Non-reactive PRs (new feature, refactor, cleanup) can lead with the change directly because there is no symptom to surface.

For reactive PRs, the symptom is the operative point, not the fix. Leading with `patch X to Y` is only correct when the reader already knows why that patch matters.

## Voice and language

- practical, direct, technical; slightly rough is better than polished
- describe behavior in prose; reach for code identifiers only to help the reviewer navigate the diff
- prefer bullets when multiple facts need to coexist; keep paragraphs short
- NEVER put periods at the end of bullet points
- no em dashes, no polished punctuation, no telltale LLM phrasing (polished transitions, generic framing, summary-heavy prose)
- write like someone close to the diff, not someone packaging it for broad consumption. never sound like release notes or an architecture memo

## Compression

When in doubt, compress harder.

- if one bullet can replace three sentences, use one bullet
- if the title and diff already explain the change, reduce the description
- do not repeat the same point in different words across description, testing, or caveats
- cut anything that only smooths prose, packages the story, or narrates the chronology of the change

## Anti-patterns - cut these specifically

Skim your draft for each one before sending.

- **code-speak narration**: prose that strings together identifiers (`availableTests`, `currentState` ledger, `fixturesByToken`) instead of describing what the system does. The reviewer should follow the description without recognizing a single symbol; identifiers appear only to locate a thing in the diff
- **mechanism step-through**: "X taps Y, then Z fires, which opens W over V" is the diff. Name the bug in one phrase ("tap on the wallet tab now opens the wallet switcher and hides the button") and stop
- **per-file enumeration**: a bullet (or sub-bullet) per file touched, summarizing the change in each one, is the diff. State the idea once; trust the reviewer to read the files
- **line numbers, file paths, commit SHAs** the reviewer can find from the diff or the linked issue. A bare `#10796` is fine; `(#10796, 05a538224)` is not
- **debug chronology and branch history**: prior failed runs, things you tried that didn't work, how the branch got here ("rebuilt from scratch", "replacing the original branch", "the previous revision"). The reviewer sees one diff; no earlier version exists. If that history shaped the code, state the constraint, not the events that discovered it
- **defensive justification**: preempting reviewer pushback ("removing it broke onboarding so the fallback stays"), explaining why something wasn't tested ("would burn another 25min of CI"), or reassuring that unrelated things still work. Either it's tested or it isn't, either the code is needed or it isn't. Skip the apologia
- **secondary commits at equal billing**: an incidental fix bundled into the PR gets one bullet, max. Do not give it its own paragraph with motivation and testing
- **evidence tables in Testing**: Testing answers "did you verify it works", not "let me prove this was worth doing". If the impact is the point, put one number in the Description. Do not dump before/after metrics in Testing
- **restating the PR's own CI**: the checks on the PR already show whether the suites passed. Never write "tests pass", "CI green", or name the suites that ran. A run that is NOT one of the PR's checks (a manual dispatch, a different pipeline) gets one line plus a link, no baselines or timing
- **status lines and work-not-done**: Testing lists verification you performed, not your task progress. Cut "device check pending", "not yet tested on X", "TODO verify Y". A reader assumes anything unlisted wasn't done, and a draft already says "unfinished". If you actually need a human to test something, write it as a specific ask, not a vague status

## Structure

- if the repo has `.github/PULL_REQUEST_TEMPLATE.md`, follow it (template wins over this skill), but keep only the sections whose question bears on this change. drop a header that doesn't apply to the PR type rather than filling it - a build, script, CI, or Rust-only PR has no screenshots, no native/web parity, and no QA flow, so those headers come out entirely. keep a section that applies but has little to say, and give it one honest line ("no manual testing, the logic is unit-tested"). never keep a header just to write "n/a", echo its prompt text, or pad it to look full
- otherwise use the patterns below

### General PR description patterns

For most PRs:

```md
## Description

- ref #
- stacked on #1234 (if this PR depends on another PR, use full URL)
- insightful motivation/context for the changes. example questions to address when relevant
  - are there any other solutions you considered?
  - what user behavior may be affected by this PR?
  - what approach did you use to arrive at this solution?

## Testing

- Manual testing steps
- Before/after screenshots
- Screen recordings
- New changes to automated tests
```

For very small PRs:

```md
## Description

- ref #1234
```

## Calibration examples

Bad:

```md
## Description

The dark mode toggle was not persisting across page reloads because the theme provider was reading from a different storage key than the toggle was writing to.

This was introduced in the recent rename of the theme storage key. We should align both sides to use the same key.

This was originally noticed by a designer and reported in #1234.
```

Why bad: buries the symptom inside the explanation, then packages chronology and motivation in polished prose - none of which the reviewer needs.

Better:

```md
## Description

- ref #1234
- when toggling dark mode, the setting reverts to light on every page reload
- `ThemeProvider` is still reading from `localStorage['theme']` after the recent rename to `'app-theme'`, so it never sees what `ThemeToggle` writes. both should now be aligned to `'app-theme'`

## Testing

- toggled dark mode, refreshed, confirmed it stays dark
- cleared local storage, confirmed default is still light
```

Why better: the first sentence is the symptom a developer hits, in their own language, so the reviewer understands why the PR exists before any technical detail - the diagnosis follows in a bullet, not as the lead.

## Quality check

Before sending, verify:

- could a reader who hasn't seen the diff, and didn't watch the code's history, understand what changed without recognizing any identifier or any descriptor that only means something by contrast to the prior state ("X-agnostic", "decoupled from X")?
- if reactive, did I lead with the symptom before the fix?
- is anything here already visible in the diff or shown by the PR's own checks? cut it
- scan each bullet for narrative tells: "rebuilt", "replacing", "previous/original version", "refreshed", timing or run counts in Testing. A hit means cut or rewrite standalone, never soften
- did I avoid repeating the same point in different words?
- does it sound like a hands-on engineer at standup, not release notes or LLM prose?
- invoke prose-style before reporting back (required)
