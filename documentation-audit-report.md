# Documentation Audit Report

Review date: 2026-07-27

## Scope

- Review mode: incremental.
- Current workflow run: `30241518535`, `Weekly Documentation Updater`, run 9, head
  `df5e8db3507a4a8a50289de554f2f60d6278f1c7`.
- Previous successful run: `29227493245`, completed 2026-07-13T06:01:19Z at
  `0c3b474fd8dfdff0eaef664d5f7ae9c618332257`.
- Boundary used: repository changes after the previous successful updater run through the current
  head. GitHub Actions and PR/commit APIs identified the successful-run boundary and merged work;
  the local checkout was shallow and could not fetch private history without credentials, so local
  file inspection was limited to the current tree.
- Tracked Markdown inventory: 90 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- #11690 updated the daily e2e coverage audit workflow so it can implement tracked gaps and open
  draft pull requests.
- #11716 added iOS app and bridge log capture to the Appium e2e runner and pipeline, matching the
  Android app-log capture path.
- #11661 added Knip and Syncpack dependency hygiene checks to the UI lint command.
- #11705 added feature-flag lifecycle documentation under the repository skill docs.
- #11598 changed feature-flag refresh behavior on app foreground.
- #11710, the WASM Clippy gate work, and the Flakebox hook-removal change updated Rust linting,
  build warnings, and local development assumptions.
- #11711, #11712, #11660, #11722, and the e2e coverage PRs #11758, #11765, #11773, #11774, #11790,
  and #11792 changed Appium/web e2e coverage and user-flow tests.

## Markdown Selected For Review

- `.agents/skills/fedi-ui-test-patterns/references/appium-running-ci.md`
- `.agents/skills/feature-flags/SKILL.md`
- `.agents/skills/feature-flags/references/flag-lifecycle-and-cleanup.md`
- `.github/workflows/daily-e2e-coverage-check.md`
- `HACKING.md`
- `README.md`
- `documentation-audit-report.md`
- `ui/README.md`
- `ui/native/docs/cicd.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub commit list and merged PR search results for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `.github/workflows/daily-e2e-coverage-check.md` and the current e2e audit prompt text.
- `.github/workflows/e2e-tests.yml`, `scripts/ci/e2e-pipeline.sh`, and
  `ui/native/tests/appium/runner.ts` for Appium artifact and log behavior.
- `.github/workflows/test-ui.yml`, `scripts/ci/check-ui-code-linting.sh`, and `ui/package.json`
  for UI lint behavior.
- `justfile`, `.github/workflows/nix.yml`, `.config/clippy-wasm/clippy.toml`, and `HACKING.md`
  for hook removal, lint, and WASM Clippy behavior.
- Feature-flag skill docs and feature-flag implementation paths for the lifecycle docs added in
  the interval.

## Findings And Changes

- `ui/native/docs/cicd.md` described UI linting as ESLint and TypeScript only. The current
  `ui/package.json` `lint` script runs workspace linting plus `lint:knip` and `lint:syncpack`, and
  `scripts/ci/check-ui-code-linting.sh` invokes that full script. Updated the CI overview to include
  Knip and Syncpack dependency hygiene checks.
- `.agents/skills/fedi-ui-test-patterns/references/appium-running-ci.md` listed Appium, pipeline,
  screenshots, and Metro artifacts, but did not mention the app bridge/UI logs now captured for
  Android and iOS. Added the end-of-run and per-failure app log filenames.
- `HACKING.md` already matches the hook-removal change, the retained `just lint` entry point, and
  the separate WASM Clippy configuration.
- `.github/workflows/daily-e2e-coverage-check.md` already matches the current implementation-driven
  e2e audit behavior and validation constraints.
- The feature-flag lifecycle docs added in #11705 are current for the compiled default and remote
  layer behavior; no additional change was needed for the foreground refresh change.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/fedi-ui-test-patterns/references/appium-running-ci.md` | Updated for app log artifacts. |
| `.agents/skills/feature-flags/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/feature-flags/references/flag-lifecycle-and-cleanup.md` | Reviewed; no change needed. |
| `.github/workflows/daily-e2e-coverage-check.md` | Reviewed; no change needed. |
| `HACKING.md` | Reviewed; no change needed. |
| `README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `ui/README.md` | Reviewed; no change needed. |
| `ui/native/docs/cicd.md` | Updated for UI dependency hygiene lint checks. |

## Validation

- Ran `git ls-files '*.md'` and counted the tracked Markdown inventory.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent commits and merged PRs through GitHub read APIs because the local git
  checkout was shallow and private fetches were unauthenticated.
- Verified edited documentation against current local code with `rg`, `sed`, and direct file reads.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The exact changed-file list could not be computed with local `git diff` because the boundary
  commit was not present and private fetches were unauthenticated. GitHub run, commit, and PR
  metadata were sufficient to map the recent work to the reviewed Markdown files.
