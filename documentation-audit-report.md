# Documentation Audit Report

Review date: 2026-08-17

## Scope

- Review mode: incremental.
- Current workflow run: [31996611900](https://github.com/fedibtc/fedi/actions/runs/31996611900), `Weekly Documentation Updater`, head [9c8c99dd726dde2879f4bcd025afb9c34118b964](https://github.com/fedibtc/fedi/commit/9c8c99dd726dde2879f4bcd025afb9c34118b964).
- Previous successful run: [31358214194](https://github.com/fedibtc/fedi/actions/runs/31358214194), completed 2026-08-10T05:26:10Z at [24f3405e571926cd16e9250a4e9dc967f1534576](https://github.com/fedibtc/fedi/commit/24f3405e571926cd16e9250a4e9dc967f1534576).
- Boundary used: repository changes after [31358214194](https://github.com/fedibtc/fedi/actions/runs/31358214194) through current head [9c8c99dd726dde2879f4bcd025afb9c34118b964](https://github.com/fedibtc/fedi/commit/9c8c99dd726dde2879f4bcd025afb9c34118b964), based on GitHub Actions run history, merged PR metadata, and commit metadata.
- Tracked Markdown inventory: 93 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- [#11898](https://github.com/fedibtc/fedi/pull/11898) added the Fedi Edge native app flavor, Edge release/deploy workflows, Fastlane lanes, `just` recipes, and Edge feature-flag endpoint behavior.
- [#11893](https://github.com/fedibtc/fedi/pull/11893), [#11895](https://github.com/fedibtc/fedi/pull/11895), [#11902](https://github.com/fedibtc/fedi/pull/11902), [#11903](https://github.com/fedibtc/fedi/pull/11903), and [#11904](https://github.com/fedibtc/fedi/pull/11904) changed the Sieve hub review workflow, review prompt, prior-feedback handling, runner selection, and UI review skill guidance.
- [#11875](https://github.com/fedibtc/fedi/pull/11875) changed the canonical WASM Clippy recipe in `flake.nix` and regenerated `justfile`.
- [#11912](https://github.com/fedibtc/fedi/pull/11912), [#11913](https://github.com/fedibtc/fedi/pull/11913), and [#11918](https://github.com/fedibtc/fedi/pull/11918) changed federation-kind detection, lnv2 recurringd dev/test override behavior, and lnv2 LNURL receive event delivery.
- [#11901](https://github.com/fedibtc/fedi/pull/11901) changed mixed-shape federation join handling.
- [#11871](https://github.com/fedibtc/fedi/pull/11871) changed guardian-fee remittance internals.
- [#11879](https://github.com/fedibtc/fedi/pull/11879) and [#11910](https://github.com/fedibtc/fedi/pull/11910) changed shared UI transaction/test behavior without changing a tracked user guide.

## Markdown Selected For Review

- `.agents/skills/ui-code-review/SKILL.md`
- `.agents/skills/ui-code-review/references/rules/i18n.md`
- `HACKING.md`
- `bridge/README.md`
- `documentation-audit-report.md`
- `scripts/ci/sieve-hub-agent-review.md`
- `ui/native/android/fastlane/README.md`
- `ui/native/docs/cicd.md`
- `ui/native/ios/fastlane/README.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results and commit list for the incremental interval.
- GitHub commit metadata and changed-file lists for [9c8c99dd726dde2879f4bcd025afb9c34118b964](https://github.com/fedibtc/fedi/commit/9c8c99dd726dde2879f4bcd025afb9c34118b964), [874672f77ca92361a3082d6a6b28807cbc695d49](https://github.com/fedibtc/fedi/commit/874672f77ca92361a3082d6a6b28807cbc695d49), [0dd28d70c5f51babbcee785e1a85dd5fd8a0c3c9](https://github.com/fedibtc/fedi/commit/0dd28d70c5f51babbcee785e1a85dd5fd8a0c3c9), [1f27a2bf750b1d32a4ab35057a32112964401c8f](https://github.com/fedibtc/fedi/commit/1f27a2bf750b1d32a4ab35057a32112964401c8f), [462142180f5242bae849ab6f7590bb2577d47294](https://github.com/fedibtc/fedi/commit/462142180f5242bae849ab6f7590bb2577d47294), [dd2128b7c4415dfb4a784afdd4188dceb9917c94](https://github.com/fedibtc/fedi/commit/dd2128b7c4415dfb4a784afdd4188dceb9917c94), [63d3ff3ffbe6e3e0aa36cff6817cafc24d14f8ab](https://github.com/fedibtc/fedi/commit/63d3ff3ffbe6e3e0aa36cff6817cafc24d14f8ab), [899ece9995748a79a0c54434efbc774b2af73186](https://github.com/fedibtc/fedi/commit/899ece9995748a79a0c54434efbc774b2af73186), [7d6aa4e0ad5b3532b638a589edc06ee2c592563a](https://github.com/fedibtc/fedi/commit/7d6aa4e0ad5b3532b638a589edc06ee2c592563a), [20ca0ea7468ce5dd5c51700390aefaa41ef8005b](https://github.com/fedibtc/fedi/commit/20ca0ea7468ce5dd5c51700390aefaa41ef8005b), [bf0529e9a6bc12a0220b64f5b150f8bd7e514cce](https://github.com/fedibtc/fedi/commit/bf0529e9a6bc12a0220b64f5b150f8bd7e514cce), [5cb2115b0eb351002da721a307030ce5d6af8412](https://github.com/fedibtc/fedi/commit/5cb2115b0eb351002da721a307030ce5d6af8412), and [e0644a85534e6d9be5a82258e89e5b32af462ec3](https://github.com/fedibtc/fedi/commit/e0644a85534e6d9be5a82258e89e5b32af462ec3).
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `.github/workflows/release-edge.yml`, `.github/workflows/deploy-to-gp-internal-testing-edge.yml`, `.github/workflows/deploy-to-testflight-edge.yml`, and `.github/workflows/renew-ios-certs.yml` for Edge release/deploy behavior.
- `ui/native/android/fastlane/Fastfile`, `ui/native/ios/fastlane/Fastfile`, `scripts/ui/build-edge-apk.sh`, `scripts/ui/build-edge-ipa.sh`, and `justfile.fedi` for Edge build lanes and recipes.
- `crates/runtime/src/constants.rs`, `crates/runtime/src/features.rs`, `ui/web/src/pages/api/features.ts`, `ui/common/utils/environment.ts`, `ui/native/bridge/native.ts`, and `ui/native/utils/device-info.ts` for Edge runtime and feature-flag behavior.
- `.github/workflows/sieve-hub-review.yml`, `scripts/ci/sieve-hub-review.sh`, `scripts/ci/sieve-hub-capture.sh`, `scripts/ci/sieve-hub-agent-review.md`, `.agents/skills/ui-code-review/SKILL.md`, and `.agents/skills/ui-code-review/references/rules/i18n.md` for Sieve review behavior.
- `bridge/fedi-ffi/src/rpc/tests.rs`, `crates/federations/src/federation_v2/mod.rs`, and `crates/federations/src/federation_v2/ln_ops/v2.rs` for the federation and lnv2 changes that might affect bridge docs.

## Findings And Changes

- `HACKING.md` was partially stale. Its CI section said release and deploy workflows are gated to release branches, but [#11898](https://github.com/fedibtc/fedi/pull/11898) added `release-edge.yml`, which is intentionally dispatched from the long-lived `edge` branch. Updated the wording to distinguish standard release branches from the Edge channel.
- `ui/native/docs/cicd.md` already documents the Edge release workflow, Edge Google Play/TestFlight deployment workflows, and dispatching from the `edge` branch.
- `ui/native/android/fastlane/README.md` and `ui/native/ios/fastlane/README.md` are current with the Edge lanes generated from the Fastfiles.
- `scripts/ci/sieve-hub-agent-review.md` already reflects `sieve attach-diff`, prior-feedback handling, dependency-source fetches under `$SIEVE_AGENT_SCRATCH`, and current dry-run validation.
- `.agents/skills/ui-code-review/SKILL.md` and `.agents/skills/ui-code-review/references/rules/i18n.md` match the current review-bot grading guidance and i18n exception for proper nouns/data tokens.
- `bridge/README.md` remains current for the reviewed kind-one/kind-two bridge test commands; the lnv2 recurringd and event-delivery changes did not add a new documented command or user-facing setup step.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/ui-code-review/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/ui-code-review/references/rules/i18n.md` | Reviewed; no change needed. |
| `HACKING.md` | Updated release/deploy workflow wording for the Edge branch dispatch model. |
| `bridge/README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `scripts/ci/sieve-hub-agent-review.md` | Reviewed; no change needed. |
| `ui/native/android/fastlane/README.md` | Reviewed; no change needed. |
| `ui/native/docs/cicd.md` | Reviewed; no change needed. |
| `ui/native/ios/fastlane/README.md` | Reviewed; no change needed. |

## Validation

- Ran `git ls-files '*.md'` and counted 93 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs, commits, and changed files with GitHub read APIs.
- Verified selected documentation against current workflows, Fastfiles, `just` recipes, Sieve scripts, Edge runtime files, and federation implementation files with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout is shallow at [9c8c99dd726dde2879f4bcd025afb9c34118b964](https://github.com/fedibtc/fedi/commit/9c8c99dd726dde2879f4bcd025afb9c34118b964), and unauthenticated `git fetch` could not read the private repository. Changed-file scope was therefore built from GitHub run, PR, and commit metadata rather than a local `git diff` against [24f3405e571926cd16e9250a4e9dc967f1534576](https://github.com/fedibtc/fedi/commit/24f3405e571926cd16e9250a4e9dc967f1534576).
