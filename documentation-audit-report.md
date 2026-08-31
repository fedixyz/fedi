# Documentation Audit Report

Review date: 2026-08-24

## Scope

- Review mode: incremental.
- Current workflow run: [32692337249](https://github.com/fedibtc/fedi/actions/runs/32692337249), `Weekly Documentation Updater`, head [00f85f57f375bbef287a666cfe0593b993070201](https://github.com/fedibtc/fedi/commit/00f85f57f375bbef287a666cfe0593b993070201).
- Previous successful run: [31996611900](https://github.com/fedibtc/fedi/actions/runs/31996611900), completed 2026-08-17T05:10:50Z at [9c8c99dd726dde2879f4bcd025afb9c34118b964](https://github.com/fedibtc/fedi/commit/9c8c99dd726dde2879f4bcd025afb9c34118b964).
- Boundary used: repository changes after [31996611900](https://github.com/fedibtc/fedi/actions/runs/31996611900) through current head [00f85f57f375bbef287a666cfe0593b993070201](https://github.com/fedibtc/fedi/commit/00f85f57f375bbef287a666cfe0593b993070201), based on GitHub Actions run history, merged PR metadata, commit metadata, and PR changed-file lists.
- Tracked Markdown inventory: 93 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- [#11937](https://github.com/fedibtc/fedi/pull/11937) merged the previous updater report and `HACKING.md` Edge-release clarification.
- [#11802](https://github.com/fedibtc/fedi/pull/11802), [#11939](https://github.com/fedibtc/fedi/pull/11939), [#11941](https://github.com/fedibtc/fedi/pull/11941), [#11947](https://github.com/fedibtc/fedi/pull/11947), [#11962](https://github.com/fedibtc/fedi/pull/11962), and [#11964](https://github.com/fedibtc/fedi/pull/11964) changed the Sieve hub review and sweep workflows, scripts, review prompt, run-record guidance, sweep cadence, app-token comment flow, and review-id argument handling.
- [#11614](https://github.com/fedibtc/fedi/pull/11614) and [#11948](https://github.com/fedibtc/fedi/pull/11948) changed the iOS bridge build path by pinning the device C CPU baseline and adding an iOS deployment-target import guard.
- [#11946](https://github.com/fedibtc/fedi/pull/11946) and [#11955](https://github.com/fedibtc/fedi/pull/11955) changed native Appium settings and onboarding tests.
- [#11911](https://github.com/fedibtc/fedi/pull/11911) and [#11927](https://github.com/fedibtc/fedi/pull/11927) changed kind-two wallet/ecash behavior and bridge coverage.
- [#11930](https://github.com/fedibtc/fedi/pull/11930) synced native app version files for 26.8.0.

## Markdown Selected For Review

- `.sieve/review-policy.md`
- `HACKING.md`
- `bridge/README.md`
- `bridge/debugging.md`
- `bridge/fedi-swift/README.md`
- `documentation-audit-report.md`
- `scripts/ci/sieve-hub-agent-review.md`
- `ui/docs/TESTING.md`
- `ui/native/docs/cicd.md`
- `ui/native/tests/README.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results, commit list, and PR changed-file lists for the incremental interval.
- GitHub commit metadata for [00f85f57f375bbef287a666cfe0593b993070201](https://github.com/fedibtc/fedi/commit/00f85f57f375bbef287a666cfe0593b993070201), [3304adca45ef6ca55e63709f3fdddeb27a273941](https://github.com/fedibtc/fedi/commit/3304adca45ef6ca55e63709f3fdddeb27a273941), [643e226899941056a403184185fbfe3ca9b574ca](https://github.com/fedibtc/fedi/commit/643e226899941056a403184185fbfe3ca9b574ca), [8761f1592a8f6a49d022b3bc062fd5eb9dc91a20](https://github.com/fedibtc/fedi/commit/8761f1592a8f6a49d022b3bc062fd5eb9dc91a20), [eeea16d283440a33eea8394ff4452cff8ab27305](https://github.com/fedibtc/fedi/commit/eeea16d283440a33eea8394ff4452cff8ab27305), [1cce807eec21c47d6b9ec5e32fe5c1fd3ad96873](https://github.com/fedibtc/fedi/commit/1cce807eec21c47d6b9ec5e32fe5c1fd3ad96873), [e5b11db87c838728c46633d8299f343c0e31cac4](https://github.com/fedibtc/fedi/commit/e5b11db87c838728c46633d8299f343c0e31cac4), [47cf1756deaf5040ec69dbe19fad9c1db1652fc7](https://github.com/fedibtc/fedi/commit/47cf1756deaf5040ec69dbe19fad9c1db1652fc7), [02ada3b034673aa8133de67db9618760dc139092](https://github.com/fedibtc/fedi/commit/02ada3b034673aa8133de67db9618760dc139092), [8aa0bdf7b59a4d348e52f6e17a25cbe983c5eebd](https://github.com/fedibtc/fedi/commit/8aa0bdf7b59a4d348e52f6e17a25cbe983c5eebd), [3b971bf51ed00419021f0faf5ae3c96aec64bf56](https://github.com/fedibtc/fedi/commit/3b971bf51ed00419021f0faf5ae3c96aec64bf56), [b64828eb46e692785a56b619384e46f4581680e6](https://github.com/fedibtc/fedi/commit/b64828eb46e692785a56b619384e46f4581680e6), [8775378bc38acc9052842a27f17a771c700b69f9](https://github.com/fedibtc/fedi/commit/8775378bc38acc9052842a27f17a771c700b69f9), and [b4bce4c740620cc09d4d71177e44c8ece228eccc](https://github.com/fedibtc/fedi/commit/b4bce4c740620cc09d4d71177e44c8ece228eccc).
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `.github/workflows/sieve-hub-review.yml`, `.github/workflows/sieve-hub-sweep.yml`, `scripts/ci/sieve-hub-review.sh`, `scripts/ci/sieve-hub-publish.sh`, `scripts/ci/sieve-hub-pr-comment.sh`, `scripts/ci/sieve-hub-sweep.sh`, `scripts/ci/sieve-hub-agent-review.md`, and `.sieve/review-policy.md` for Sieve review and sweep behavior.
- `scripts/bridge/build-bridge-ios.sh`, `scripts/bridge/check-ios-min-version-imports.sh`, `scripts/bridge/ios-min-version-import-denylist.txt`, `Cargo.toml`, and `Cargo.lock` for iOS bridge build behavior.
- `ui/native/tests/appium/common/Settings.test.ts`, `ui/native/tests/appium/common/onboarding.test.ts`, and `ui/native/tests/README.md` for native Appium behavior.
- `bridge/fedi-ffi/src/rpc/tests.rs`, `crates/federations/src/federation_v2/mod.rs`, `crates/federations/src/federation_v2/db.rs`, `crates/federations/src/federation_v2/mint_ops/v2.rs`, and `crates/federations/src/lib.rs` for the kind-two wallet and ecash behavior that might affect bridge docs.
- Native version files from [#11930](https://github.com/fedibtc/fedi/pull/11930), including `ui/native/package.json`, `ui/native/android/app/build.gradle`, and iOS `Info.plist` files.

## Findings And Changes

- `bridge/README.md` was partially stale. The iOS build description omitted the deployment-target import guard added by [#11948](https://github.com/fedibtc/fedi/pull/11948). Updated the iOS build section to mention that `build-bridge-ios.sh` rejects Apple symbols newer than the deployment target.
- `.sieve/review-policy.md` already reflects run-record auditing through `sieve versions` and `sieve run get`; no change needed for [#11939](https://github.com/fedibtc/fedi/pull/11939).
- `scripts/ci/sieve-hub-agent-review.md` already reflects `sieve attach-diff`, prior-feedback handling, dependency-source fetches under `$SIEVE_AGENT_SCRATCH`, run-record trace handling, and current dry-run validation.
- `HACKING.md` remains current for the Sieve sweep, Appium, bridge commands, release/deploy branch model, and native versioning changes reviewed in this run.
- `ui/native/docs/cicd.md` remains current for the reviewed 26.8.0 version sync and release/deploy behavior.
- `ui/native/tests/README.md` and `ui/docs/TESTING.md` remain current for the Appium settings/onboarding test changes; the tests changed assertions inside existing suites and did not add a new command or suite entry.
- `bridge/debugging.md` and `bridge/fedi-swift/README.md` remain current; the iOS bridge build guard changes build validation, not runtime debugging or Swift package usage.

## Per-Document Status

| File | Status |
| --- | --- |
| `.sieve/review-policy.md` | Reviewed; no change needed. |
| `HACKING.md` | Reviewed; no change needed. |
| `bridge/README.md` | Updated iOS build description for deployment-target import validation. |
| `bridge/debugging.md` | Reviewed; no change needed. |
| `bridge/fedi-swift/README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `scripts/ci/sieve-hub-agent-review.md` | Reviewed; no change needed. |
| `ui/docs/TESTING.md` | Reviewed; no change needed. |
| `ui/native/docs/cicd.md` | Reviewed; no change needed. |
| `ui/native/tests/README.md` | Reviewed; no change needed. |

## Validation

- Ran `git ls-files '*.md'` and counted 93 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs, commits, and changed files with GitHub read APIs.
- Verified selected documentation against current workflows, bridge build scripts, Sieve scripts, Appium tests, federation implementation files, and native version files with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout is shallow at [00f85f57f375bbef287a666cfe0593b993070201](https://github.com/fedibtc/fedi/commit/00f85f57f375bbef287a666cfe0593b993070201), and does not contain the previous successful run's commit. Changed-file scope was therefore built from GitHub run, PR, and commit metadata rather than a local `git diff` against [9c8c99dd726dde2879f4bcd025afb9c34118b964](https://github.com/fedibtc/fedi/commit/9c8c99dd726dde2879f4bcd025afb9c34118b964).
