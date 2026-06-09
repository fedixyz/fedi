---
name: ui-code-review
description: Review a UI pull request or diff in the `ui/` workspace (web, native, shared `common`) for regressions and scope creep, weighing each finding by cost and blocking only on a named cost. Use whenever asked to review a UI or frontend PR or diff, or to check a web or native change before merge, even if the user does not say "code review". Not for Rust, bridge, or infra changes.
user-invocable: true
---

# UI Code Review

You are reviewing a change in the `ui/` workspace (the web, native, and shared `common` TypeScript/React code) to reduce the risk of shipping something that costs the team later, and to hand the person running the review a set of findings ordered by cost. The regression vectors below assume the TS/React/React Native stack. For Rust, bridge, or infra changes, stop and tell the reviewer this skill does not cover them.

Two things make a review effective: the principles that decide what is worth a comment and what should block, and the discipline of actually walking the diff. Both are below.

These are principles, not a procedure. They sometimes yield to each other. The aim is to keep software quality high without slowing each other down, and to focus reviews on what actually matters. The value of code review comes from applying these principles consistently to every pull request, so run the same way each time.

Read the principles first; they decide what matters. The procedure is how you find it. Rigor toward the code, respect toward the author.

## Principles

### 1. Reviews exist to reduce risk

The most valuable thing a review does is reduce the risk of shipping something that costs us later. For any change, the highest-value question is "how would we know if this broke later?" It is worth more than most line comments combined.

- Tests are the only durable artifact of a review. Comments fade; coverage stays in the codebase and runs on every future change. When a change is risky and the test is missing, asking for the test is the highest-leverage thing you can do.
- A PR is at its strongest when its description already says how the change does not regress what was working and points at the tests that prove it. When you review, look for that. On a risky change, its absence is itself a finding.
- Coverage and scrutiny scale with risk. High-risk surfaces (shared state, the Rust bridge, payments, auth, federation lifecycle) warrant automated coverage and a closer read; low-risk changes (styling, copy, simple fixes) often warrant neither. Do not demand tests for a copy tweak; do demand them, and read closely, when the blast radius is large.
- When automated coverage is thin and the risk warrants it, exercise the behavior yourself instead of trusting it by inspection.

### 2. Respect each other's time and attention

A PR is a request for the reviewer's attention, and a comment is a claim on the author's time. Be patient and thoughtful, especially when a change triggers another round of testing.

- Everything an author controls (title, description, diff size, commit order, test plan) exists to let the reviewer build the right mental model fast. A description that says why the change exists, not just what changed, is the anchor for judging whether it solved the problem; the what is already in the diff. Spend that effort when you author; use it when you review.
- Self-review the diff in the GitHub UI before requesting review. If you would not want to read it, neither does the reviewer.
- As a reviewer, read the description first, then skim the whole diff before commenting on any single line. Many comments dissolve once you have the full context: a question the description already answered, or an issue the next file resolves.
- A review that spends itself on naming and whitespace while the risky path goes unread is the failure mode, not thoroughness.
- For context questions ("why does this exist?", "where is this called?"), searching the codebase is usually faster than pinging the author.

### 3. Shared conventions are how we move fast

- Lean on the local code. Matching what is already there minimizes friction and keeps the codebase legible.
- Conventions evolve. A PR introducing something new is a starting point for discussion, not a defect.
- A draft PR is a fine place to advocate for a new convention. To actually decide one, raise it in a meeting or open an async ticket or doc proposal.
- If the same comment keeps appearing across PRs, the convention deserves a home outside the review thread: a doc, a lint rule, a test, a checklist.

### 4. Block on cost, not preference

Before marking anything blocking, name the cost: a real bug, a measurable performance hit, a specific maintainability problem, a security issue. If you cannot name the cost, it does not block.

- Convention divergence by itself is not a cost. If divergence creates a real maintainability problem, name that problem specifically. Do not block on "we do not do it this way."
- A PR you would have written differently is still a PR that should land. Preferences do not block.
- A PR is ready to merge when it solves the problem it set out to solve, does not break what was working, and blocking comments are resolved.
- Cost means cost this PR adds. On a port of behavior that already ships on native, a bug reproduced faithfully from native is pre-existing, not this PR's cost: note it once as out of scope and do not block, citing the native `path:line` to downgrade. A divergence from native still counts.
- Behind a flag, "not feature-complete yet" is not a cost. flag-OFF must reproduce prior behavior, so a flag-off regression blocks. flag-ON may be incomplete, but a live control must be inert, never wired to the wrong action, and anything wrong that moves funds blocks. These flags flip server-side, so file incomplete-but-coming work as a follow-up.

### 5. Disagreement is information

- Frame the comment about the code, not the person. A technically correct comment can still cost trust if it lands as a verdict on the author.
- As an author, push back once with your reasoning when you think a comment is wrong. You owe an honest read, not deference.
- As a reviewer, when the author pushes back, take the read seriously, since they may be right, or may hold context you did not have.
- The second round is usually where someone learns something. By the third round, move to chat, a call, or the next team meeting, since async text is a poor medium for an argument. Drop a one-line resolution back into the thread once it is settled.
- Closing a PR is a joint decision. If a PR is going the wrong direction, leave a comment explaining why and give the author time to respond before closing.

### Comment categories

Not tags anyone has to use, just a way to think about what kind of comment you are leaving and a vocabulary for when you want to be explicit. Order findings by cost. If it is ambiguous whether something blocks, "is this blocking or a suggestion?" is a fair thing to ask.

| Kind | What it means | What the author owes |
|------|---------------|----------------------|
| **blocking** | must change before merge, with a named cost | address it, or take the disagreement to chat |
| **suggest** | a recommended improvement that does not block merge | consider it, reply briefly if you decline |
| **nit** | a preference that will not be re-checked | optional, a reaction or no change is fine |
| **question** | missing context or checking intent, not a change request | answer and await resolution |
| **praise** | acknowledgment of good work | nothing owed, but worth doing |

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

- Caller and consumer contract breaks when a signature, return shape, or side-effect set changes. Hooks especially, since stale assumptions about what they return or do propagate widely.
- One value recomputed in one place but not another: list view vs. detail view, totals vs. line items, a balance or fee shown two ways.
- Secondary read surfaces for the same data: CSV/export, push notifications, analytics, search, share intents, deeplinks.
- Behavior the diff removes silently: focus-event refresh, mount-time sync, rounding, clamping, retry, error handling, polling.
- Selector or state-source confusion: the right state read through the wrong selector, or stale state read at the wrong moment.
- Cross-platform parity. Logic added on native or web that already exists, or should exist, in shared `common` code. Every PR here states its impact on native/web parity (see the PR template); hold the change to that. "Should be a common hook" is a real finding.
- Rename- or refactor-only changes that cross an external boundary: deeplinks, persisted state keys, exported data, public RPC names. "Just renaming" is a frequent source of silent breakage.
- User-facing copy and terminology: internal terms leaking into the UI (e.g. `room` where the product says `group` or `chat`), inconsistent naming.
- Hardcoded user-facing strings. Every string a user can see (screen copy, overlay and toast text, button labels, error messages surfaced to the UI or to miniapp callers) must go through i18n: `t()` with a key in `ui/common/localization/en/common.json`. This is blocking, not hygiene. The app ships in ~20 locales, so raw English is broken UI for most users. That is the named cost. Do not downgrade because "it's just copy" or because the code is new rather than a regression.
- Dead or experimental code left in: a disabled block, a failed-experiment codepath, a commented-out branch. It survives reviews because it looks inert. Flag it for removal.
- Comments added or changed in the diff: hold them to the project's comment conventions.
- Tests: apply the project's testing patterns (the `fedi-ui-test-patterns` skill). Watch for missing branch coverage and assertions on implementation details instead of behavior.
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
