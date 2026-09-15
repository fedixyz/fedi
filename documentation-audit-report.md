# Documentation Audit Report

Review date: 2026-09-14

## Scope

- Review mode: incremental.
- Current workflow run: [34807727783](https://github.com/fedibtc/fedi/actions/runs/34807727783), `Weekly Documentation Updater`, head [3ba8c9d7181c56dffe67f1688f12dfbcdd107d9c](https://github.com/fedibtc/fedi/commit/3ba8c9d7181c56dffe67f1688f12dfbcdd107d9c).
- Previous successful run: [34084792755](https://github.com/fedibtc/fedi/actions/runs/34084792755), completed 2026-09-07T05:01:53Z at [4b02f9cda31a8834ccf194e6ea3c5f3539afc81d](https://github.com/fedibtc/fedi/commit/4b02f9cda31a8834ccf194e6ea3c5f3539afc81d).
- Boundary used: repository changes after [34084792755](https://github.com/fedibtc/fedi/actions/runs/34084792755) through current head [3ba8c9d7181c56dffe67f1688f12dfbcdd107d9c](https://github.com/fedibtc/fedi/commit/3ba8c9d7181c56dffe67f1688f12dfbcdd107d9c), based on GitHub Actions run history, merged PR metadata, commit metadata, and PR changed-file lists.
- Tracked Markdown inventory: 99 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- [#12091](https://github.com/fedibtc/fedi/pull/12091) merged the previous updater report and added this audit file to the tracked Markdown inventory.
- [#12149](https://github.com/fedibtc/fedi/pull/12149) updated Manifold to [11f735b47674d526b4f8e393858b39f6c3a2c5ca](https://github.com/fedibtc/manifold/commit/11f735b47674d526b4f8e393858b39f6c3a2c5ca) and Fedimint crates to `v0.11.2-fedi4`.
- [#12176](https://github.com/fedibtc/fedi/pull/12176) and [#12177](https://github.com/fedibtc/fedi/pull/12177) changed FI formation projection so `Formed + Unsynced` remains `formed`, added `dkgComplete`, renamed the abandonment reason to `dkgComplete`, and regenerated bindings.
- [#12128](https://github.com/fedibtc/fedi/pull/12128), [#12146](https://github.com/fedibtc/fedi/pull/12146), [#12147](https://github.com/fedibtc/fedi/pull/12147), [#12158](https://github.com/fedibtc/fedi/pull/12158), and [#12175](https://github.com/fedibtc/fedi/pull/12175) changed Wallet Service status monitoring, join failure handling, metadata read-through, and simulator behavior.
- [#12167](https://github.com/fedibtc/fedi/pull/12167), [#12168](https://github.com/fedibtc/fedi/pull/12168), and [#12174](https://github.com/fedibtc/fedi/pull/12174) replaced the Wallet Service knob simulator with scripted devtools and moved those devtools under `ui/native`.
- [#12148](https://github.com/fedibtc/fedi/pull/12148) bounded new mint-v1 FI seat-payment outputs while preserving recovery of already-journaled oversized payments.
- [#12140](https://github.com/fedibtc/fedi/pull/12140) made devimint await Esplora before the client peg-in.
- [#12108](https://github.com/fedibtc/fedi/pull/12108), [#12135](https://github.com/fedibtc/fedi/pull/12135), [#12152](https://github.com/fedibtc/fedi/pull/12152), [#12088](https://github.com/fedibtc/fedi/pull/12088), and [#12100](https://github.com/fedibtc/fedi/pull/12100) changed web and native E2E tests or runners.
- [#12109](https://github.com/fedibtc/fedi/pull/12109) changed the Edge release notification to link to the GitHub release page instead of a direct APK asset.
- [#11944](https://github.com/fedibtc/fedi/pull/11944) added the iOS Edge Firebase config and removed the stale Nightly resource from the Edge target.
- [#12116](https://github.com/fedibtc/fedi/pull/12116), [#12117](https://github.com/fedibtc/fedi/pull/12117), [#12118](https://github.com/fedibtc/fedi/pull/12118), [#12125](https://github.com/fedibtc/fedi/pull/12125), and [#12129](https://github.com/fedibtc/fedi/pull/12129) changed multispend and USDT runtime behavior without changing a tracked user guide.

## Markdown Selected For Review

- `.agents/skills/fedi-ui-test-patterns/SKILL.md`
- `HACKING.md`
- `SECURITY.md`
- `bridge/README.md`
- `bridge/debugging.md`
- `bridge/fedi-swift/README.md`
- `documentation-audit-report.md`
- `ui/docs/TESTING.md`
- `ui/native/README.md`
- `ui/native/android/fastlane/README.md`
- `ui/native/docs/cicd.md`
- `ui/native/ios/fastlane/README.md`
- `ui/native/tests/README.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results, commit list, and PR changed-file lists for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `.github/workflows/e2e-tests.yml`, `.github/workflows/release-edge.yml`, `scripts/ci/e2e-pipeline.sh`, `scripts/ci/notify-edge-release.sh`, `scripts/ui/run-e2e.sh`, `scripts/ui/run-e2e-web.sh`, and `ui/native/tests/appium/registry.ts`.
- `SECURITY.md`, `HACKING.md`, `crates/bridge/src/fi_client.rs`, `crates/bridge/src/fi_client/tests.rs`, `crates/bridge/src/fi_payments.rs`, `crates/fedimint/devi/src/devfed.rs`, `crates/rpc-types/src/fi_client.rs`, `ui/common/redux/fi.ts`, and `ui/common/types/bindings.ts`.
- `flake.nix`, `Cargo.toml`, and PR changed-file metadata for the dependency pin updates.
- `ui/native/ios/FediReactNative.xcodeproj/project.pbxproj`, `ui/native/ios/firebase-edge/GoogleService-Info.plist`, and generated Fastlane READMEs for iOS/Android release documentation.

## Findings And Changes

- `SECURITY.md` was stale for FI launch recovery. It said an unsynced persisted `Formed` record is projected as `PublishingSeatBindings`; current bridge projection keeps `Formed` and reports the recheck through `freshness`. Updated the security boundary wording.
- `HACKING.md` had the same stale FI lifecycle statement. Updated it to say `Formed + Unsynced` stays `formed`, `freshness` carries the launch recheck, and only fresh `Formed` is maintenance-ready.
- `HACKING.md` was stale for Fedimint pins after [#12149](https://github.com/fedibtc/fedi/pull/12149). Updated the fork note to reflect upstream Nix `fedimint/fedimint` `v0.11.2` and Fedi Cargo tag `v0.11.2-fedi4`.
- `ui/docs/TESTING.md`, `ui/native/docs/cicd.md`, and `ui/native/tests/README.md` remain current for the reviewed E2E runner/test changes, including `scripts/ui/run-e2e-web.sh --with-devfed`, CI web E2E behavior, and current Appium menu entries.
- `ui/native/README.md`, `ui/native/ios/fastlane/README.md`, and `ui/native/android/fastlane/README.md` remain current for the reviewed Edge Firebase and Fastlane changes; no generated Fastlane lane documentation changed.
- `.agents/skills/fedi-ui-test-patterns/SKILL.md`, `bridge/README.md`, `bridge/debugging.md`, and `bridge/fedi-swift/README.md` remain current for the reviewed test-helper, bridge, and Swift-package changes.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/fedi-ui-test-patterns/SKILL.md` | Reviewed; no change needed. |
| `HACKING.md` | Updated FI lifecycle and Fedimint pin notes. |
| `SECURITY.md` | Updated FI launch-recovery projection wording. |
| `bridge/README.md` | Reviewed; no change needed. |
| `bridge/debugging.md` | Reviewed; no change needed. |
| `bridge/fedi-swift/README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `ui/docs/TESTING.md` | Reviewed; no change needed. |
| `ui/native/README.md` | Reviewed; no change needed. |
| `ui/native/android/fastlane/README.md` | Reviewed; no change needed. |
| `ui/native/docs/cicd.md` | Reviewed; no change needed. |
| `ui/native/ios/fastlane/README.md` | Reviewed; no change needed. |
| `ui/native/tests/README.md` | Reviewed; no change needed. |

## Validation

- Ran `git ls-files '*.md'` and counted 99 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs, commits, and changed files with GitHub read APIs.
- Verified selected documentation against current workflows, E2E scripts, Appium registry, bridge/FI implementation files, release workflow files, Fastlane generated docs, and dependency pins with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout is shallow at [3ba8c9d7181c56dffe67f1688f12dfbcdd107d9c](https://github.com/fedibtc/fedi/commit/3ba8c9d7181c56dffe67f1688f12dfbcdd107d9c), and the unauthenticated Git remote cannot fetch private history. Changed-file scope was therefore built from GitHub run, PR, and commit metadata rather than a local `git diff` against [4b02f9cda31a8834ccf194e6ea3c5f3539afc81d](https://github.com/fedibtc/fedi/commit/4b02f9cda31a8834ccf194e6ea3c5f3539afc81d).
