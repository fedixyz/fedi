# Documentation Audit Report

Review date: 2026-09-07

## Scope

- Review mode: incremental.
- Current workflow run: [34084792755](https://github.com/fedibtc/fedi/actions/runs/34084792755), `Weekly Documentation Updater`, head [4b02f9cda31a8834ccf194e6ea3c5f3539afc81d](https://github.com/fedibtc/fedi/commit/4b02f9cda31a8834ccf194e6ea3c5f3539afc81d).
- Previous successful run: [33358642053](https://github.com/fedibtc/fedi/actions/runs/33358642053), completed 2026-08-31T05:02:32Z at [f3567b775dbf89ddd1877bd13dfbdeae3f31dac4](https://github.com/fedibtc/fedi/commit/f3567b775dbf89ddd1877bd13dfbdeae3f31dac4).
- Boundary used: repository changes after [33358642053](https://github.com/fedibtc/fedi/actions/runs/33358642053) through current head [4b02f9cda31a8834ccf194e6ea3c5f3539afc81d](https://github.com/fedibtc/fedi/commit/4b02f9cda31a8834ccf194e6ea3c5f3539afc81d), based on GitHub Actions run history, merged PR metadata, commit metadata, and PR changed-file lists.
- Tracked Markdown inventory: 98 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- [#11977](https://github.com/fedibtc/fedi/pull/11977) merged the previous updater report and the `bridge/README.md` iOS deployment-target import guard note.
- [#11945](https://github.com/fedibtc/fedi/pull/11945), [#11993](https://github.com/fedibtc/fedi/pull/11993), [#12010](https://github.com/fedibtc/fedi/pull/12010), and [#12018](https://github.com/fedibtc/fedi/pull/12018) changed native release, version, certificate, nightly, and public APK workflow behavior.
- [#11890](https://github.com/fedibtc/fedi/pull/11890), [#11952](https://github.com/fedibtc/fedi/pull/11952), [#11953](https://github.com/fedibtc/fedi/pull/11953), [#11961](https://github.com/fedibtc/fedi/pull/11961), [#11975](https://github.com/fedibtc/fedi/pull/11975), [#11992](https://github.com/fedibtc/fedi/pull/11992), [#11999](https://github.com/fedibtc/fedi/pull/11999), and [#12021](https://github.com/fedibtc/fedi/pull/12021) changed Appium and Playwright E2E coverage, runner options, test choices, and dev-fed requirements.
- [#12006](https://github.com/fedibtc/fedi/pull/12006), [#12064](https://github.com/fedibtc/fedi/pull/12064), [#12087](https://github.com/fedibtc/fedi/pull/12087), and [#12090](https://github.com/fedibtc/fedi/pull/12090) changed FI bridge lifecycle, reset, release-policy, Manifold pin, and recovered-wallet payment behavior.
- [#11987](https://github.com/fedibtc/fedi/pull/11987), [#11994](https://github.com/fedibtc/fedi/pull/11994), [#12015](https://github.com/fedibtc/fedi/pull/12015), [#12065](https://github.com/fedibtc/fedi/pull/12065), [#12066](https://github.com/fedibtc/fedi/pull/12066), and [#12080](https://github.com/fedibtc/fedi/pull/12080) changed bridge federation, ecash, fedimintd, and wallet-service behavior.
- [#11973](https://github.com/fedibtc/fedi/pull/11973) changed QR rendering behavior without changing a tracked user guide.
- [#12019](https://github.com/fedibtc/fedi/pull/12019) added release-operation skills and updated the web-release skill with sibling release-process pointers.
- [e2dbe650699ece9be49c4125b5cfc658dd328007](https://github.com/fedibtc/fedi/commit/e2dbe650699ece9be49c4125b5cfc658dd328007) changed the `fs-dir-cache` eviction window used by CI.

## Markdown Selected For Review

- `.agents/skills/android-release/SKILL.md`
- `.agents/skills/fedi-ui-test-patterns/SKILL.md`
- `.agents/skills/ios-release/SKILL.md`
- `.agents/skills/report-next-release/SKILL.md`
- `.agents/skills/web-release/SKILL.md`
- `HACKING.md`
- `SECURITY.md`
- `bridge/README.md`
- `bridge/debugging.md`
- `bridge/fedi-swift/README.md`
- `documentation-audit-report.md`
- `ui/docs/TESTING.md`
- `ui/native/docs/cicd.md`
- `ui/native/tests/README.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results, commit list, and PR changed-file lists for the incremental interval.
- GitHub commit metadata for [4b02f9cda31a8834ccf194e6ea3c5f3539afc81d](https://github.com/fedibtc/fedi/commit/4b02f9cda31a8834ccf194e6ea3c5f3539afc81d), [5905896789ae25c69dfa56865f3ae209cfcd7111](https://github.com/fedibtc/fedi/commit/5905896789ae25c69dfa56865f3ae209cfcd7111), [de44cca1d5d055d92e31293b97060635bbede7c7](https://github.com/fedibtc/fedi/commit/de44cca1d5d055d92e31293b97060635bbede7c7), [c6e327db6b7469688a2d3faaa65e696c3a27fde1](https://github.com/fedibtc/fedi/commit/c6e327db6b7469688a2d3faaa65e696c3a27fde1), [d733ff9b0c61fcdd485ad7f1352c7716120d949b](https://github.com/fedibtc/fedi/commit/d733ff9b0c61fcdd485ad7f1352c7716120d949b), [9a7cf87ff8098fe1617ffae2acba0ca5caa50234](https://github.com/fedibtc/fedi/commit/9a7cf87ff8098fe1617ffae2acba0ca5caa50234), [61f0b1f08f233cb2b9a67d7c14a84a9df0419323](https://github.com/fedibtc/fedi/commit/61f0b1f08f233cb2b9a67d7c14a84a9df0419323), [f6f1dac36b23f1f483fdee4a7080201ab63a4727](https://github.com/fedibtc/fedi/commit/f6f1dac36b23f1f483fdee4a7080201ab63a4727), [05765bb1715325b139b51596294bcb4667f51993](https://github.com/fedibtc/fedi/commit/05765bb1715325b139b51596294bcb4667f51993), [41299bcdd1035d60c3cf6e37ec7971fac0f7c6f0](https://github.com/fedibtc/fedi/commit/41299bcdd1035d60c3cf6e37ec7971fac0f7c6f0), [1b028aecbd6099b3b5d5c8061345821cc64d6871](https://github.com/fedibtc/fedi/commit/1b028aecbd6099b3b5d5c8061345821cc64d6871), [5cd4afdeb3cd1098ede6d7cd8e1d6b73b440a95a](https://github.com/fedibtc/fedi/commit/5cd4afdeb3cd1098ede6d7cd8e1d6b73b440a95a), [1bdcf6c54c2bdea551dfd36dd2a9a8192ba538f9](https://github.com/fedibtc/fedi/commit/1bdcf6c54c2bdea551dfd36dd2a9a8192ba538f9), [fcc83dcdcbbaab4ae0dc2b7c29a7417326cc595c](https://github.com/fedibtc/fedi/commit/fcc83dcdcbbaab4ae0dc2b7c29a7417326cc595c), and [5c420d42aa1a2c159fbd0b22e1d92491135a6575](https://github.com/fedibtc/fedi/commit/5c420d42aa1a2c159fbd0b22e1d92491135a6575).
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `.github/workflows/e2e-tests.yml`, `scripts/ci/e2e-pipeline.sh`, `scripts/ui/run-e2e.sh`, `scripts/ui/run-e2e-web.sh`, `ui/native/tests/appium/registry.ts`, and selected Appium/Playwright tests for E2E behavior.
- `.github/workflows/deploy-public-apk-to-github.yml`, `.github/workflows/release-nightly.yml`, `.github/workflows/deploy-to-testflight-nightly.yml`, `.github/workflows/deploy-to-gp-internal-testing-nightly.yml`, `scripts/ci/install-apple-certs.sh`, `scripts/ci/run-in-fs-dir-cache.sh`, and native version files for CI/release behavior.
- `SECURITY.md`, `crates/bridge/src/fi_client.rs`, `crates/bridge/src/fi_payments.rs`, `crates/runtime/src/bridge_runtime.rs`, `crates/runtime/src/db.rs`, `bridge/fedi-ffi/src/rpc.rs`, `crates/rpc-types/src/fi_client.rs`, and generated TypeScript bindings for FI bridge behavior.
- `crates/federations/src/federation_v2/mod.rs`, `crates/federations/src/federation_v2/meta.rs`, `crates/federations/src/federation_v2/mint_ops/v1.rs`, `crates/federations/src/federation_v2/mint_ops/v2.rs`, `crates/fedimint/fedimintd/src/main.rs`, and `scripts/test-fm-upstream-tests.sh` for bridge and fedimintd behavior.
- `.agents/skills/android-release/SKILL.md`, `.agents/skills/ios-release/SKILL.md`, `.agents/skills/report-next-release/SKILL.md`, and `.agents/skills/web-release/SKILL.md` for newly tracked release-process documentation.

## Findings And Changes

- `ui/native/tests/README.md` was stale. Its quick-start menu omitted `communityChatJoin`, `miniAppSeed`, `chatPayments`, `ecashLifecycle`, and `stableBalance`, all present in `scripts/ui/run-e2e.sh` and `ui/native/tests/appium/registry.ts`. Updated the menu list.
- `ui/docs/TESTING.md` was partially stale. The web E2E section omitted the `--with-devfed` option added for payment specs and CI. Updated the options and CI behavior description.
- `ui/native/docs/cicd.md` was partially stale. The web E2E workflow description omitted that CI now runs `scripts/ui/run-e2e-web.sh --with-devfed`. Updated that line.
- `SECURITY.md` already reflects the FI reset exception and recovered-wallet seat-payment behavior from [#12006](https://github.com/fedibtc/fedi/pull/12006) and [#12090](https://github.com/fedibtc/fedi/pull/12090).
- `bridge/README.md` remains current for the iOS deployment-target import guard, bridge build commands, and updated federation behavior reviewed in this run.
- `HACKING.md` remains current for the reviewed release workflow, bridge/FI, and test command changes.
- `.agents/skills/fedi-ui-test-patterns/SKILL.md` already reflects web payment E2E tests against the local dev fed and Appium shared drivers.
- `.agents/skills/android-release/SKILL.md`, `.agents/skills/ios-release/SKILL.md`, `.agents/skills/report-next-release/SKILL.md`, and `.agents/skills/web-release/SKILL.md` are new or updated release-operation docs and match the current scripts and workflow split reviewed here.
- `bridge/debugging.md` and `bridge/fedi-swift/README.md` remain current; the bridge changes reviewed here do not change their debugging or Swift package usage guidance.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/android-release/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/ios-release/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/report-next-release/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/web-release/SKILL.md` | Reviewed; no change needed. |
| `HACKING.md` | Reviewed; no change needed. |
| `SECURITY.md` | Reviewed; no change needed. |
| `bridge/README.md` | Reviewed; no change needed. |
| `bridge/debugging.md` | Reviewed; no change needed. |
| `bridge/fedi-swift/README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `ui/docs/TESTING.md` | Updated web E2E dev-fed option and CI behavior. |
| `ui/native/docs/cicd.md` | Updated web E2E workflow command and dev-fed behavior. |
| `ui/native/tests/README.md` | Updated interactive Appium test menu entries. |

## Validation

- Ran `git ls-files '*.md'` and counted 98 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs, commits, and changed files with GitHub read APIs.
- Verified selected documentation against current workflows, E2E scripts, Appium registry, bridge/FI implementation files, release-operation skills, and native release workflow files with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout is shallow at [4b02f9cda31a8834ccf194e6ea3c5f3539afc81d](https://github.com/fedibtc/fedi/commit/4b02f9cda31a8834ccf194e6ea3c5f3539afc81d), and does not contain the previous successful run's commit. Changed-file scope was therefore built from GitHub run, PR, and commit metadata rather than a local `git diff` against [f3567b775dbf89ddd1877bd13dfbdeae3f31dac4](https://github.com/fedibtc/fedi/commit/f3567b775dbf89ddd1877bd13dfbdeae3f31dac4).
