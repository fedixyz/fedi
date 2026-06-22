# Documentation Audit Report

Review date: 2026-06-22

## Scope

- Review mode: incremental.
- Current workflow run: `27934482990`, `Weekly Documentation Updater`, run 4, head `358c7bab570a0cf75fa63995d95c8af8e1473da0`.
- Previous successful run: `26760809414`, completed 2026-06-01T14:37:49Z at `5fcfd2a39a2e44d740a32d81190e01b74323a5c6`.
- Boundary used: repository changes after the previous successful updater run through the current head. The local checkout was shallow and did not contain the boundary commit, so GitHub Actions, commit, PR, and PR-file APIs were used for the incremental map.
- Tracked Markdown inventory: 85 files before this run; this run adds `ui/docs/meta_fields/federation_expiry_timestamp.md`, so the inventory will be 86 files after merge.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- #10484 and #11540 added and expanded Playwright web e2e coverage, `scripts/ui/run-e2e-web.sh`, `ui/web/playwright.config.ts`, and the `web` platform in `.github/workflows/e2e-tests.yml`.
- #11433 changed the daily e2e audit workflow and deterministic audit context scripts.
- #11559 changed the weekly documentation updater workflow and compiled lock.
- #10934 added the internal miniapp API debugger and changed `sendInjectorMessage` to support `AbortSignal`.
- #11030 changed federation auto-select expiry filtering and prefixed metadata lookup.
- #11435 and #11378 added the `message_reactions` feature flag and chat reaction runtime/UI behavior.
- #11382 bumped Fedimint dependencies to the 0.11 Fedi tag and adjusted bridge/runtime test support.
- #11483, #11487, and #11528 changed agent skill Markdown under `.agents/skills`.
- #11441, #11446, #11532, #11558, and related commits changed Appium e2e test flows and available test options.

## Markdown Selected For Review

- `.agents/skills/feature-flags/SKILL.md`
- `.agents/skills/fedi-ui-test-patterns/references/appium-writing.md`
- `.agents/skills/ui-code-review/SKILL.md`
- `.github/workflows/daily-e2e-coverage-check.md`
- `.github/workflows/weekly-doc-updater.md`
- `bridge/README.md`
- `documentation-audit-report.md`
- `ui/docs/LINKING.md`
- `ui/docs/TESTING.md`
- `ui/docs/meta_fields/README.md`
- `ui/docs/meta_fields/federation_expiry_timestamp.md`
- `ui/docs/meta_fields/popup_end_timestamp.md`
- `ui/injections/README.md`
- `ui/native/docs/cicd.md`
- `ui/native/tests/README.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub commit list and selected PR file lists for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `.github/workflows/e2e-tests.yml`, `.github/workflows/daily-e2e-coverage-check.md`, and `.github/workflows/weekly-doc-updater.md`.
- `scripts/ui/run-e2e.sh`, `scripts/ui/run-e2e-web.sh`, `ui/web/package.json`, `ui/package.json`, and `ui/web/playwright.config.ts`.
- `ui/injections/src/index.ts`, `ui/injections/src/utils.ts`, and current `sendInjectorMessage` call sites.
- `ui/common/utils/FederationUtils.ts` and `ui/common/types/fedimint.ts` for supported meta-field behavior.
- `crates/runtime/src/features.rs`, `ui/web/src/pages/api/features.ts`, and generated feature bindings through repository search.

## Findings And Changes

- `ui/docs/TESTING.md` was stale for web e2e. It now documents Playwright web e2e tests, the `run-e2e-web.sh` wrapper, local port behavior, Linux/Nix browser requirements, CI artifact output, and fixes a typo in the remote bridge section.
- `ui/native/docs/cicd.md` omitted the current `End-to-end tests` workflow and its `web` platform. It now summarizes Android, iOS, and web e2e jobs and their runner scripts.
- `ui/native/tests/README.md` listed only older Appium menu choices. It now includes the current settings, chat, payments, backup/restore, and PIN protection options.
- `ui/injections/README.md` had an outdated `makeWebViewMessageHandler` signature and did not mention the abortable `sendInjectorMessage` helper. It now matches the current middleware parameter and documents timeout/cancellation usage.
- `ui/docs/meta_fields/README.md` did not list `federation_expiry_timestamp`, even though current code supports it as an unprefixed compatibility alias for expiry handling. A new meta-field page documents the field, timestamp format, and the 30-day auto-select exclusion behavior.
- Reviewed workflow and agent-skill docs changed in the interval; no additional drift was found there.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/feature-flags/SKILL.md` | Reviewed; no change needed. The new `message_reactions` flag follows the documented add/consume workflow. |
| `.agents/skills/fedi-ui-test-patterns/references/appium-writing.md` | Reviewed; no change needed. Current Appium conventions include the recent text/testID guidance. |
| `.agents/skills/ui-code-review/SKILL.md` | Reviewed; no change needed. Split rule references are documented. |
| `.github/workflows/daily-e2e-coverage-check.md` | Reviewed; no change needed. The prompt matches the deterministic full-codebase audit behavior. |
| `.github/workflows/weekly-doc-updater.md` | Reviewed; no change needed. Incremental scope and safe-output requirements match this run's workflow. |
| `bridge/README.md` | Reviewed; no change needed for the Fedimint 0.11 dependency bump. Existing build/test guidance is unchanged by the inspected code. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `ui/docs/LINKING.md` | Reviewed; no change needed. The native deeplink tightening still matches the documented `/link?screen=...` requirements. |
| `ui/docs/TESTING.md` | Updated for Playwright web e2e and current CI behavior. |
| `ui/docs/meta_fields/README.md` | Updated to list `federation_expiry_timestamp`. |
| `ui/docs/meta_fields/federation_expiry_timestamp.md` | Added. |
| `ui/docs/meta_fields/popup_end_timestamp.md` | Reviewed; no change needed. The new page links to it rather than duplicating popup-message details. |
| `ui/injections/README.md` | Updated for `sendInjectorMessage` and `makeWebViewMessageHandler`. |
| `ui/native/docs/cicd.md` | Updated for the current e2e workflow. |
| `ui/native/tests/README.md` | Updated for the current native e2e test menu. |

## Validation

- Ran `git ls-files '*.md'` and counted the tracked Markdown inventory.
- Cross-checked the previous successful updater run with GitHub Actions API.
- Cross-checked recent commits and selected PR file lists through GitHub read APIs because the local git checkout was shallow.
- Verified edited documentation against current local code and workflow files with `rg`, `sed`, and direct file reads.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The incremental interval touched many product UI files. This run reviewed docs mapped to changed behavior and foundational docs; it did not perform a full Markdown audit because a previous successful run boundary was available.
- `bridge/README.md` still contains older manual troubleshooting guidance, but the Fedimint 0.11 bump did not provide a clear, repo-supported replacement path in the inspected files.
