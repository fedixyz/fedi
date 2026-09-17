# Release notes copy

The words that reach a user through the App Store What's New, the Play release notes and the GitHub release body. All three are written from the release contents as this skill grounds them, the summary cards of Step 7, never from PR titles. The card rules in `SKILL.md` (source every sentence from the diff or the PR body, write what a user observes, check what gates a feature) apply to every sentence here too.

## What the copy says

- one item per user-facing change, written as what a person can now do or stops running into
- a product-facing paragraph on what the release as a whole introduces and enables, written for someone who will never open a PR. Say what it does and enables, not how it works

## What the copy never says

- a feature that is off in production, and any mention of a flag or a gate. The summary card with the Feature flagged badge stays in the attached report and nowhere else
- what the release does not carry, other crashes, unverified findings
- mechanism narration, code identifiers, review state, follow-up work
- report links, QA verdicts, release mechanics

## Per destination

- App Store What's New and Play release notes: the same text in every locale the app ships, under the store caps (Play rejects a text over 500 characters). Non-English copy comes from the user or the translation process, never improvised. A patch release usually reuses the previous version's notes verbatim, so ask before writing new copy
- GitHub draft release body: the `Built from commit:` line CI wrote stays first. A patch continues with `As <previous version>, but` and one bullet per PR as `- #NNNN - <what the user gains or stops seeing>`, then the product-facing paragraph. A feature release clusters the bullets by product item the way the summary cards do, links the rendered report, and attaches it to the draft as `release-<major>-notes.html` and `release-<major>-notes.pdf` with `gh release upload <version> <files>`, so the notes do not depend on the link staying up. Chrome writes the PDF from the same file: `chrome --headless --print-to-pdf=<pdf> <html>`

Get the user's sign-off on the copy before writing it to any store or to the draft.
