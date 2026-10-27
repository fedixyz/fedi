# Documentation Audit Report

Review date: 2026-10-26

## Scope

- Review mode: incremental.
- Current workflow run: [40271838218](https://github.com/fedibtc/fedi/actions/runs/40271838218), `Weekly Documentation Updater`, head [a41153f389f2bc453961ed5ba7ff363f2f75be2c](https://github.com/fedibtc/fedi/commit/a41153f389f2bc453961ed5ba7ff363f2f75be2c).
- Previous successful run: [39202043436](https://github.com/fedibtc/fedi/actions/runs/39202043436), completed 2026-10-19T05:03:57Z at [45fe29a977145ee07f68a206001e8a6526cab075](https://github.com/fedibtc/fedi/commit/45fe29a977145ee07f68a206001e8a6526cab075).
- Boundary used: repository changes after [39202043436](https://github.com/fedibtc/fedi/actions/runs/39202043436) through current head [a41153f389f2bc453961ed5ba7ff363f2f75be2c](https://github.com/fedibtc/fedi/commit/a41153f389f2bc453961ed5ba7ff363f2f75be2c), based on GitHub Actions run history, merged PR metadata, commit metadata, and PR changed-file lists.
- Tracked Markdown inventory: 108 files.

## Changed Areas Driving Review

Key merged PRs mapped to tracked docs:

- [#12457](https://github.com/fedibtc/fedi/pull/12457) updated the `report-next-release` skill and release-note reference copy.
- [#12432](https://github.com/fedibtc/fedi/pull/12432) updated the backport skill for open PRs picked onto backport branches.
- [#12427](https://github.com/fedibtc/fedi/pull/12427) added the remote `federationTransfers` feature flag and Edge-specific feature serving.
- [#12411](https://github.com/fedibtc/fedi/pull/12411) and [#12395](https://github.com/fedibtc/fedi/pull/12395) changed production and nightly Discover federation metadata.
- [#11780](https://github.com/fedibtc/fedi/pull/11780) added Android 16 KB native-library alignment checks to APK workflows, Play upload lanes, and bridge Android library builds.
- [#11784](https://github.com/fedibtc/fedi/pull/11784) upgraded React Native for Android 16, changed Android emulator/API setup, and updated Appium driver behavior.
- [#12452](https://github.com/fedibtc/fedi/pull/12452) raised the iOS e2e job timeout to 150 minutes.
- [#12453](https://github.com/fedibtc/fedi/pull/12453) expanded deep-link and nightly federation e2e coverage.
- [#12429](https://github.com/fedibtc/fedi/pull/12429) updated Fedimint to `v0.12.0-fedi14` and updated `HACKING.md`.
- [#12446](https://github.com/fedibtc/fedi/pull/12446) exposed wallet-service app settings through FA metadata RPC and generated bindings.
- [#12233](https://github.com/fedibtc/fedi/pull/12233), [#12426](https://github.com/fedibtc/fedi/pull/12426), and [#12408](https://github.com/fedibtc/fedi/pull/12408) changed chat payment, balance event, and iOS chat input behavior without requiring standalone doc updates.
- [#12431](https://github.com/fedibtc/fedi/pull/12431), [#12440](https://github.com/fedibtc/fedi/pull/12440), and [#12456](https://github.com/fedibtc/fedi/pull/12456) were version-sync PRs that did not require docs beyond this report.

## Markdown Selected For Review

- `.agents/skills/backport/SKILL.md`
- `.agents/skills/feature-flags/SKILL.md`
- `.agents/skills/report-next-release/SKILL.md`
- `.agents/skills/report-next-release/references/release-notes-copy.md`
- `HACKING.md`
- `SECURITY.md`
- `documentation-audit-report.md`
- `ui/docs/TESTING.md`
- `ui/docs/meta_fields/README.md`
- `ui/docs/meta_fields/autojoin_communities.md`
- `ui/docs/meta_fields/multispend_disabled.md`
- `ui/docs/meta_fields/pinned_message.md`
- `ui/native/android/fastlane/README.md`
- `ui/native/docs/cicd.md`
- `ui/native/tests/README.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results, commit metadata, and PR changed-file lists for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `ui/web/src/pages/api/features.ts` and `crates/runtime/src/features.rs` for feature-flag maps and compiled defaults.
- `.github/workflows/upload-android-apk.yml`, `.github/workflows/release-production.yml`, release-channel workflows, `ui/native/android/fastlane/Fastfile`, and `scripts/ci/check-apk-16kb-alignment.sh` for Android release gates.
- `.github/workflows/e2e-tests.yml`, `scripts/ci/e2e-pipeline.sh`, `scripts/ui/start-android-emulators.sh`, and `scripts/ui/setup-and-start-appium.sh` for native e2e device and timeout behavior.
- `ui/common/types/fedimint.ts`, `ui/common/utils/FederationUtils.ts`, `ui/common/hooks/fa.ts`, and FA metadata RPC changes for supported meta fields and wallet-service app settings.
- `ui/web/src/pages/api/federations.ts`, `ui/web/public/meta-federations.json`, `ui/web/public/meta-federations-nightly.json`, and federation e2e helpers for Discover metadata behavior.

## Findings And Changes

- `.agents/skills/feature-flags/SKILL.md` was stale after [#12427](https://github.com/fedibtc/fedi/pull/12427). It still described only production and development remote maps. Updated it to include `edgeRemoteFeatures` and `edgeDevRemoteFeatures`.
- `ui/native/docs/cicd.md` was stale after [#11780](https://github.com/fedibtc/fedi/pull/11780). It did not mention the 16 KB page-size alignment gate now run for GitHub APK releases and Fastlane Play uploads. Updated the APK and Play Store deployment sections.
- `ui/docs/meta_fields/README.md` was incomplete for supported metadata read by current code and surfaced by wallet-service settings in [#12446](https://github.com/fedibtc/fedi/pull/12446). Added `fedi:autojoin_communities` and `fedi:multispend_disabled` to the index, fixed existing Community typos in meta-field docs, and created concise docs for both fields.
- `.agents/skills/backport/SKILL.md`, `.agents/skills/report-next-release/SKILL.md`, `.agents/skills/report-next-release/references/release-notes-copy.md`, and `HACKING.md` already reflected their recent source changes.
- `ui/native/tests/README.md` and `ui/docs/TESTING.md` remain current for the native/web e2e behavior reviewed in this interval.
- `ui/native/android/fastlane/README.md` is generated by Fastlane and still lists the lane names accurately; the alignment check is documented in `ui/native/docs/cicd.md` instead.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/backport/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/feature-flags/SKILL.md` | Updated Edge remote feature map guidance. |
| `.agents/skills/report-next-release/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/report-next-release/references/release-notes-copy.md` | Reviewed; no change needed. |
| `HACKING.md` | Reviewed; no change needed. |
| `SECURITY.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `ui/docs/TESTING.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/README.md` | Updated with missing supported meta fields. |
| `ui/docs/meta_fields/autojoin_communities.md` | Created. |
| `ui/docs/meta_fields/multispend_disabled.md` | Created. |
| `ui/docs/meta_fields/pinned_message.md` | Fixed existing typo found during meta-field review. |
| `ui/native/android/fastlane/README.md` | Reviewed; no change needed because it is generated lane documentation. |
| `ui/native/docs/cicd.md` | Updated Android 16 KB alignment gate coverage. |
| `ui/native/tests/README.md` | Reviewed; no change needed. |

## Validation

- Ran `git ls-files '*.md'` and counted 108 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs, commits, and changed files with GitHub read APIs.
- Verified selected documentation against current workflows, scripts, API routes, feature-flag implementation, federation metadata utilities, and e2e test files with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout does not contain [45fe29a977145ee07f68a206001e8a6526cab075](https://github.com/fedibtc/fedi/commit/45fe29a977145ee07f68a206001e8a6526cab075), and the unauthenticated Git remote cannot fetch private history. Changed-file scope was therefore built from GitHub run, PR, and commit metadata rather than a local `git diff` against [45fe29a977145ee07f68a206001e8a6526cab075](https://github.com/fedibtc/fedi/commit/45fe29a977145ee07f68a206001e8a6526cab075).
