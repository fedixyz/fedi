# Review principles

These are principles, not a procedure. They sometimes yield to each other. The aim is to keep software quality high without slowing each other down, and to focus reviews on what actually matters. The value of code review comes from applying these principles consistently to every pull request, so run the same way each time.

## 1. Reviews exist to reduce risk

The most valuable thing a review does is reduce the risk of shipping something that costs us later. For any change, the highest-value question is "how would we know if this broke later?" It is worth more than most line comments combined.

- Tests are the only durable artifact of a review. Comments fade; coverage stays in the codebase and runs on every future change. When a change is risky and the test is missing, asking for the test is the highest-leverage thing you can do.
- A PR is at its strongest when its description already says how the change does not regress what was working and points at the tests that prove it. When you review, look for that. On a risky change, its absence is itself a finding.
- Coverage and scrutiny scale with risk. High-risk surfaces (shared state, the Rust bridge, payments, auth, federation lifecycle) warrant automated coverage and a closer read; low-risk changes (styling, copy, simple fixes) often warrant neither. Do not demand tests for a copy tweak; do demand them, and read closely, when the blast radius is large.
- When automated coverage is thin and the risk warrants it, exercise the behavior yourself instead of trusting it by inspection.

## 2. Respect each other's time and attention

A PR is a request for the reviewer's attention, and a comment is a claim on the author's time. Be patient and thoughtful, especially when a change triggers another round of testing.

- Everything an author controls (title, description, diff size, commit order, test plan) exists to let the reviewer build the right mental model fast. A description that says why the change exists, not just what changed, is the anchor for judging whether it solved the problem; the what is already in the diff. Spend that effort when you author; use it when you review.
- Self-review the diff in the GitHub UI before requesting review. If you would not want to read it, neither does the reviewer.
- As a reviewer, read the description first, then skim the whole diff before commenting on any single line. Many comments dissolve once you have the full context: a question the description already answered, or an issue the next file resolves.
- A review that spends itself on naming and whitespace while the risky path goes unread is the failure mode, not thoroughness.
- For context questions ("why does this exist?", "where is this called?"), searching the codebase is usually faster than pinging the author.

## 3. Shared conventions are how we move fast

- Lean on the local code. Matching what is already there minimizes friction and keeps the codebase legible.
- Conventions evolve. A PR introducing something new is a starting point for discussion, not a defect.
- A draft PR is a fine place to advocate for a new convention. To actually decide one, raise it in a meeting or open an async ticket or doc proposal.
- If the same comment keeps appearing across PRs, the convention deserves a home outside the review thread: a doc, a lint rule, a test, a checklist.

## 4. Block on cost, not preference

Before marking anything blocking, name the cost: a real bug, a measurable performance hit, a specific maintainability problem, a security issue. If you cannot name the cost, it does not block.

- Convention divergence by itself is not a cost. If divergence creates a real maintainability problem, name that problem specifically. Do not block on "we do not do it this way."
- A PR you would have written differently is still a PR that should land. Preferences do not block.
- A PR is ready to merge when it solves the problem it set out to solve, does not break what was working, and blocking comments are resolved.
- Cost means cost this PR adds. On a port of behavior that already ships on native, a bug reproduced faithfully from native is pre-existing, not this PR's cost: note it once as out of scope and do not block, citing the native `path:line` to downgrade. A divergence from native still counts.
- Behind a flag, "not feature-complete yet" is not a cost. flag-OFF must reproduce prior behavior, so a flag-off regression blocks. flag-ON may be incomplete, but a live control must be inert, never wired to the wrong action, and anything wrong that moves funds blocks. These flags flip server-side, so file incomplete-but-coming work as a follow-up.

## 5. Disagreement is information

- Frame the comment about the code, not the person. A technically correct comment can still cost trust if it lands as a verdict on the author.
- As an author, push back once with your reasoning when you think a comment is wrong. You owe an honest read, not deference.
- As a reviewer, when the author pushes back, take the read seriously, since they may be right, or may hold context you did not have.
- The second round is usually where someone learns something. By the third round, move to chat, a call, or the next team meeting, since async text is a poor medium for an argument. Drop a one-line resolution back into the thread once it is settled.
- Closing a PR is a joint decision. If a PR is going the wrong direction, leave a comment explaining why and give the author time to respond before closing.

## Comment categories

Not tags anyone has to use, just a way to think about what kind of comment you are leaving and a vocabulary for when you want to be explicit. Order findings by cost. If it is ambiguous whether something blocks, "is this blocking or a suggestion?" is a fair thing to ask.

| Kind | What it means | What the author owes |
|------|---------------|----------------------|
| **blocking** | must change before merge, with a named cost | address it, or take the disagreement to chat |
| **suggest** | a recommended improvement that does not block merge | consider it, reply briefly if you decline |
| **nit** | a preference that will not be re-checked | optional, a reaction or no change is fine |
| **question** | missing context or checking intent, not a change request | answer and await resolution |
| **praise** | acknowledgment of good work | nothing owed, but worth doing |
