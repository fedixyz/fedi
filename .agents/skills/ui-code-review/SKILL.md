---
name: ui-code-review
description: Review a UI pull request or diff in the `ui/` workspace (web, native, shared `common`) for regressions and scope creep, weighing each finding by cost and blocking only on a named cost. Use whenever asked to review a UI or frontend PR or diff, or to check a web or native change before merge, even if the user does not say "code review". Not for Rust, bridge, or infra changes.
user-invocable: true
---

# UI Code Review

## For the Greptile code review bot

If you are the Greptile code review bot (or another always-on PR review bot), ignore everything in this skill except the files in `references/rules/`. Do not apply:

- `references/principles.md` (the review principles)
- the `## How to run a review` procedure and its regression vectors
- `## Anti-patterns`

Use only the concrete, fedi-specific rules in `references/rules/`, scoped to `ui/**`. You already have general review judgment. The rest is process for a human or a developer-invoked agent. If a developer asked you to run this skill, it is not about you: use everything.

You are reviewing a change in the `ui/` workspace (the web, native, and shared `common` TypeScript/React code) to reduce the risk of shipping something that costs the team later, and to hand the person running the review a set of findings ordered by cost. The regression vectors below assume the TS/React/React Native stack. For Rust, bridge, or infra changes, stop and tell the reviewer this skill does not cover them.

Three parts:

- **Principles** ([`references/principles.md`](references/principles.md)): what is worth a comment and what should block, plus the comment categories. Read them first, they decide what matters.
- **Rules** ([`references/rules/`](references/rules/)): concrete, fedi-specific patterns to enforce (i18n, shared `common` code, tests, feature flags).
- **Procedure** (below): the discipline of actually walking the diff.

Rigor toward the code, respect toward the author.

## How to run a review

Copy this and work through it. Do not skip steps.

```
Review progress:
- [ ] Read the description, then skim the whole diff before commenting on any line
- [ ] Re-derive what the diff does from the code, not from the description
- [ ] Walk each chunk: name the behavior change in plain language
- [ ] For every changed signature, return shape, or side effect, trace every caller
- [ ] For every removed line, name the behavior that went with it
- [ ] For every fix, ask: root cause or symptom suppression?
- [ ] Sweep the regression vectors below
- [ ] Flag any new dependency
- [ ] Weigh each finding by cost; mark blocking only with a named cost
```

### Read the diff like it might be wrong

Build your own model of what the diff does from the code. The description tells you what the author believes the change does; re-derive it. Where the two disagree you have either a doc bug or a code bug, so find out which. Read the description first and skim the whole diff before commenting, since many comments dissolve once you have the full context.

Walking the diff chunk by chunk is the review. For each chunk:

- Name the behavior change in plain language, from the code. If you cannot say what changed, you have not reviewed it.
- If a function, hook, or RPC signature, return shape, or set of side effects changed, trace every caller. Regressions hide in the consumer the author did not think about, not in the function they edited. This is the highest-yield thing a reviewer does.
- If lines were removed, name the behavior that went with them: a focus refresh, a mount-time sync, a rounding or clamp, an error path, a retry, a poll. Removed code is the easiest regression to miss, because nothing red points at it.
- If new abstraction or indirection was added, ask whether it serves the stated problem or is scope carried for free. Would the fix survive without it?

### Root cause vs. indirect fix

A common, costly pattern: the PR makes a symptom go away by removing or short-circuiting something tangential while the real cause sits untouched. Indirect fixes are regressions waiting to happen, because the bug recurs under slightly different conditions, or the load-bearing line that got removed was incidentally holding something else up. This is the most under-detected class of problem, so hunt for it deliberately.

For each fix, ask: does this address the cause or suppress the symptom? Could it recur under slightly different conditions? Is a load-bearing line (a sync, a focus handler, a clamp, an error branch) being removed because it happened to mask the symptom? If the fix looks indirect, say so and point at the real cause.

### Regression vectors

The fedi-specific, enforceable patterns below link to `references/rules/`. The rest are judgment vectors for a person or agent running the review.

- Caller and consumer contract breaks when a signature, return shape, or side-effect set changes. Hooks especially, since stale assumptions about what they return or do propagate widely.
- Secondary read surfaces for the same data: CSV/export, push notifications, analytics, search, share intents, deeplinks.
- Behavior the diff removes silently: focus-event refresh, mount-time sync, rounding, clamping, retry, error handling, polling.
- Selector or state-source confusion: the right state read through the wrong selector, or stale state read at the wrong moment.
- Shared code and native/web parity, including a value recomputed in two places: see `references/rules/shared-common-code.md`. Every PR here states its native/web parity impact (see the PR template).
- Rename- or refactor-only changes that cross an external boundary: deeplinks, persisted state keys, exported data, public RPC names. "Just renaming" is a frequent source of silent breakage.
- User-facing copy and terminology: internal terms leaking into the UI (e.g. `room` where the product says `group` or `chat`), inconsistent naming.
- Hardcoded user-facing strings: see `references/rules/i18n.md`. Blocking, not hygiene.
- Dead or experimental code left in: a disabled block, a failed-experiment codepath, a commented-out branch. It survives reviews because it looks inert. Flag it for removal.
- Comments added or changed in the diff: hold them to the project's comment conventions.
- Tests: see `references/rules/tests.md`.
- Feature-flagged behavior: see `references/rules/feature-flags.md`.
- UX edge cases: loading, empty, ambiguous-zero ("0 sats" indistinguishable from "unknown"), slow or missing data, error states, offline.

### Security questions (structural)

Secure review is not a separate pass; it is a handful of structural questions asked on every change. A real answer is a named cost under principle 4, not a new gate.

- Does the change widen the attack surface? A new RPC, deeplink, miniapp message, or external input is a new boundary.
- Are inputs validated and sanitized at the boundary they cross (miniapp calls, deeplinks, RPC args), not assumed clean once inside?
- Do auth, permission, and federation-membership checks run at the layer that owns the rule, not skipped or duplicated across callers?
- Could the change leak sensitive data (seed words, ecash notes, recovery material, tokens, balances) into logs, error messages, analytics, or response bodies?
- If a bridge call throws or an operation is interrupted, what state is left behind: half-spent ecash, a pending op, an inconsistent balance?

### New dependencies

A new runtime or build dependency is a top-level finding regardless of diff size. The bar is justification, not size. Ask: is the functionality achievable without it? What is the maintenance signal (last release, maintainers, downloads, supply-chain risk)? Did the author justify it, or is it incidental? Default position: a new dependency needs an explicit reason.

### Do not inherit a prior reviewer's confidence

An existing approval is not evidence the code is correct. Approvals often land within an hour from a single reviewer, sometimes alongside an unresolved concern. Read earlier threads, but weigh them yourself.

- A concern phrased as a question ("is this intended?", "won't this fail on iOS?") that the author never answered is a potential unhandled regression, not a closed thread.
- Reviewer comments citing AI/LLM output are input, not authority. Re-derive the claim from the code before relying on it.

### Output

Deliver findings to the person running the review, ordered by cost so the reader acts on the highest-stakes items first. Ordering is not filtering: surface the small things too, under the right weight, and let the author decide what to act on. Give each finding as:

- a one-line summary
- `path:line` references to navigate directly
- the specific behavior change or risk in plain language
- what to verify, what will fail, or what is at risk

When you run this skill yourself, surface findings and their weights for the person running the review and let them decide what to send. Do not approve, request changes, or make a merge decision on the author's behalf, since that is the team's call.

## Anti-patterns

- Do not trust the description as authoritative. Re-derive from the code.
- Do not stop at the changed lines. Tracing callers and consumers is the work.
- Do not soften a real finding with charitable framing ("the author probably meant..."). State what the code does, then the risk, about the code and never the person.
- Do not block on preference. Name the cost, or downgrade to suggest or nit.
- Do not drop findings to keep the report short. Order by cost instead.
- Do not demand tests for trivial changes, or wave through a high-risk surface that has none.
