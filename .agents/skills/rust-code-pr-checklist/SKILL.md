---
name: rust-code-pr-checklist
description: Pre-submit checklist for PRs that change Rust or bridge code (`crates/`) in the Fedi project. Use before opening or updating a Rust or bridge PR to run the right local checks and structure the description. Not for UI (`ui/`), docs, or config-only changes, which have their own conventions.
---

# Rust Code PR Checklist

Use this before creating or updating a PR that changes Rust or bridge code (`crates/`) in the Fedi project.

This checklist is for Rust and bridge changes only. UI (`ui/`), docs, and config-only PRs have their own conventions, so don't reach for it there.

## Pre-submit checks

- Verify `just final-check` passes. It runs `lint`, `clippy`, and `just test`, so Rust formatting, lints, and tests are covered in one shot.

## PR description

The repo ships `.github/PULL_REQUEST_TEMPLATE.md`, and it is the source of truth for which sections a PR has. Fill the sections it gives you instead of inventing your own. The notes below are how to fill its `Description` well, not a competing section list.

- summarize the change in a sentence or two, then explain why it exists and the design decisions a reviewer can't see from the diff
- call out anything you want reviewers to scrutinize or be opinionated about
- under `Testing`, name the automated tests that cover the change or the manual steps you ran

Keep the description proportional to the change. A small or self-evident fix can be a one-line `Description` with a `- ref #`. Don't pad a trivial PR to fill every section.
