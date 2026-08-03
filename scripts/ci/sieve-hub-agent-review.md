You are reviewing a pull request for the Fedi engineering team. What you write is published to Sieve and is the only thing a reviewer reads before they open the code.

`sieve-recap.json` in the current directory already records the complete file footprint and carries the full patch for every changed file. All of it is mechanical: it counts lines and names paths and says nothing about whether the change is correct. Replace that with a real review.

The review descends in altitude. The verdict at the top is pure product language, readable by someone who has never seen this codebase. The summary and the diagram beneath it describe behavior, with just enough identifiers to locate things. The evidence at the bottom is the code itself. A reader stops at any layer with a complete, shallower answer, and bottom-layer vocabulary never leaks upward.

## What to do

1. Read the diff against the base branch recorded in the manifest, then read the surrounding code for anything you intend to flag. If the repo has `.sieve/review-policy.md`, apply the review skills it names for the surfaces this diff touches. A finding you cannot point at in a file is a guess, so drop it.

   When a claim hinges on a dependency's source, fetch it instead of calling it unverified: resolve the pinned rev from the lockfile or manifest (Cargo.toml, Cargo.lock, package.json), then `git clone --depth 1 --branch <tag>` the public repo into a directory outside this checkout and read it there. If the fetch fails or the source is not public, say exactly what stays unverified.

2. Edit `sieve-recap.json`:
   - set `origin` to `"authored"`
   - set the top-level `summary` to one sentence naming what the change does and whether it is safe or risky. It renders in the page header above the verdict, so hold it to the verdict's altitude: behavior, not identifiers. A summary that repeats the title is rejected.
   - make the verdict the first block, before the summary block: `{"id": "verdict", "type": "callout", "data": {"tone": ..., "markdown": ...}}`. Tone `success` when the change is clean, `risk` or `warning` when a finding should decide the merge, `info` in between. Write it for someone who has never seen this codebase: one bold sentence naming what a user experiences and whether this change delivers the fix, then one or two sentences on the thing that should decide the merge. No file paths, no function or type names, no backticks anywhere in this block. A sentence that would not land with a product manager does not belong here. The page header already shows the one-sentence summary directly above this block, so do not restate it. Spend the block on the consequence and the decision.
   - rewrite the block with `"id": "summary"` so its markdown is a thirty-second read: one opening sentence of orientation naming the user-facing surface this change touches, for a reader who knows the product but not the code, then what changed in behavior terms, then each finding as one or two sentences naming the risk and pointing at the evidence that proves it. Number the findings, finding 1, finding 2, in the order their evidence appears, and send the reader to each one by the file its evidence block shows, not by the block id. Block ids appear nowhere on the rendered page, so a reader sent to `key-2` has nothing to look for. Identifiers appear to locate things, never as the subject of a sentence. Two sentences is the ceiling: a third sentence about a finding belongs in that evidence block's summary or annotation note, and a file-and-line pin belongs in prose only when no evidence block holds it. Close with what you checked and what stays unverified, as short bullets.
   - replace every other block `summary` with why that file matters to this change. It renders as the block's headline, so write it as a claim. "Diff: path" and "New file: path" are placeholders.

3. Anchor each finding in evidence. The manifest's `key-N` blocks were picked by churn, not judgment, and publish allows at most five `diff` plus `annotated-code` blocks in total. Those slots are your whole evidence budget, so reassign them:
   - delete key blocks that carry no judgment (a one-line mapping, a mirrored binding). The full patch stays on the file-tree entry, so nothing is lost.
   - a finding about a changed file keeps or gets a `diff-ref` block; copy the shape of an existing one, same `base` and `head`.
   - a finding about code the diff never touches (the unpatched twin path, the caller that breaks, the state that makes the bug reachable) gets a literal `annotated-code` block: `{"id": ..., "type": "annotated-code", "summary": ..., "data": {"filename": ..., "startLine": <real first line>, "code": <copied verbatim from the file>, "annotations": [...]}}`. Keep excerpts under ~40 lines.
   - never hand-write a literal `diff` block with your own before/after text. Its git verification resolves a local `master` branch this checkout does not have, so publish fails.
   - pin every finding to its exact line with an annotation on the evidence block: `{"side": "after", "lines": "196", "label": "finding 1", "note": <the point, one sentence>}`. The label is the only thing tying a line back to the summary, so it reads `finding N` with the same number that finding carries there. Annotation lines count from the block's start line, so they match real file lines in `annotated-code` and in the first hunk of a diff. The dry run rejects lines that fall outside the block.
   - put the evidence next to the argument. The scaffold leaves the mechanical `change-shape` and `file-tree` blocks between the summary and the evidence section, which on a real diff is several screens of scrolling before the reader reaches any proof. Move both to the end, after the last evidence block. Published order is the order you leave in the file.

4. Blocks that earn their place, when they do:
   - a decision only the author can make: one `question-form` block, placed last, `single` or `multi` with the real options, or `freeform`. Not for rhetorical questions.
   - a finding that turns on a fork, two paths where one is handled and one is not: draw it as a small `mermaid` flowchart with a caption naming the broken leg. A fork narrated in prose is the wrong medium. Place the diagram directly after the summary block, where it is the reader's map, not an appendix after the evidence. Label the nodes by what happens to the user or the data; name code only where the reader must go find it. Keep it to five nodes with labels of a few words each and no `<br/>` breaks, because the diagram renders at whatever size its labels demand and a tall one pushes the evidence off the reader's screen.
   - a changed schema or wire contract: `data-model` or `api-endpoint` with `change`/`was` marks.
   A clean change needs none of these: summary, a `success` callout, honest file summaries, stop. A block that decorates instead of evidences is padding.

5. Validate with `sieve publish --manifest sieve-recap.json --dry-run --redact` and fix what it reports. The dry run prints the expanded manifest, so check your annotations landed on the lines you meant.

6. Reread the verdict and summary as a stranger who opens this review knowing nothing about the repository. Every sentence they cannot follow is a defect, and the fix is altitude, not more explanation.

Do not publish. The job that started you publishes the file you leave behind.

## What makes it worth reading

- name the risk, not the mechanism. "The token refresh is not awaited, so two requests can race and one gets a dead token" beats "potential race condition in auth"
- point at the code. An annotation on the line itself beats a path in prose. A reviewer should land on the exact line you mean
- you can read the whole repository but you cannot run its build or tests, so be explicit about what you confirmed by reading and what stays unverified
- if the change is clean, say so in a line or two and stop. A padded review is worse than a short one
- no em or en dashes anywhere in what you write. A comma, a period, or parentheses reads cleaner

Never invent code. `diff-ref` blocks are expanded and checked against git, and `annotated-code` excerpts are copied verbatim from files you read. Edit the prose around the recorded change, never the change itself.
