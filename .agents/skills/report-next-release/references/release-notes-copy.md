# Release notes copy

The words that reach a user through the App Store What's New, the Play release notes and the GitHub release body. All three are written from the release contents as this skill grounds them, the summary cards of Step 7, never from PR titles. The card rules in `SKILL.md` (source every sentence from the diff or the PR body, write what a user observes, check what gates a feature) apply to every sentence here too.

## Where the draft is

`summary.release_notes` in the report JSON, written in Step 7 of `SKILL.md` while the cards are in front of you: `store` is the store text and `bullets` are the one-per-PR lines. The Summary renders the store text as suggested release notes under the scope line, and Full report renders the GitHub body ready to paste. The `ios-release` and `android-release` skills take the signed-off store text from there instead of drafting their own.

## What the copy says

- one item per user-facing change, written as what a person can now do or stops running into

## What the copy never says

- a feature that is off in production, and any mention of a flag or a gate. The summary card with the Feature flagged badge stays in the attached report and nowhere else
- what the release does not carry, other crashes, unverified findings
- mechanism narration, code identifiers, review state, follow-up work
- a missing translation. English is the primary language and the other languages catch up
- in the store notes, a capability only the Fedi team notices. The GitHub release body gives it a bullet that says what Fedi or its staff can do
- QA verdicts, release mechanics
- a report link, except the line that links the report in the GitHub release body

## Per destination

- App Store What's New and Play release notes: the same text in every locale the app ships, under the store caps (Play rejects a text over 500 characters). Translate the signed-off English into the other locales yourself, matching the register and recurring terms of the previous release's text in each language. A patch release usually reuses the previous version's notes verbatim, so ask before writing new copy
- GitHub draft release body: the `Built from commit:` line CI wrote stays first. The next line links the report on the release notes site, `Release notes: https://release-notes.apps.fedibtc.com/<version>/` (see `internal-site.md`). A patch continues with one bullet per PR as `- #NNNN - <what the user gains or stops seeing>`. A feature release clusters the bullets by product item the way the summary cards do, and attaches the report to the draft as `release-<major>-notes.html` and `release-<major>-notes.pdf` with `gh release upload <version> <files>`, so the notes do not depend on the link staying up. Chrome writes the PDF from the same file: `chrome --headless --print-to-pdf=<pdf> <html>`. The body carries nothing else. A summary paragraph or the store text would repeat what the report and the store listings say
- GitHub draft release body for a `web/X.Y.Z` release: the `Built from commit:` line, then the release notes line with `?platform=web` appended to the link, which opens the summary on the web changes only. It has no bullets, because the report already lists the changes

Get the user's sign-off on store copy before writing it to any store. Write the GitHub draft release body without asking. The draft stays invisible until the user publishes it.
