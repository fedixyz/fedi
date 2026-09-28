# Documentation Audit Report

Review date: 2026-09-28

## Scope

- Review mode: incremental.
- Current workflow run: [36379899685](https://github.com/fedibtc/fedi/actions/runs/36379899685), `Weekly Documentation Updater`, head [cd798fc9d069c9702908bf25e9590f2dc1a901a1](https://github.com/fedibtc/fedi/commit/cd798fc9d069c9702908bf25e9590f2dc1a901a1).
- Previous successful run: [35562642113](https://github.com/fedibtc/fedi/actions/runs/35562642113), completed 2026-09-21T05:02:15Z at [15c8bf5e0c6ed67c26e1671dc53d6b98ff406b7a](https://github.com/fedibtc/fedi/commit/15c8bf5e0c6ed67c26e1671dc53d6b98ff406b7a).
- Boundary used: repository changes after [35562642113](https://github.com/fedibtc/fedi/actions/runs/35562642113) through current head [cd798fc9d069c9702908bf25e9590f2dc1a901a1](https://github.com/fedibtc/fedi/commit/cd798fc9d069c9702908bf25e9590f2dc1a901a1), based on GitHub Actions run history, merged PR metadata, commit metadata, and PR changed-file lists.
- Tracked Markdown inventory: 102 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- [#12230](https://github.com/fedibtc/fedi/pull/12230) added `fedi_getSeed` and `fedi_saveFile` coverage to the miniapp API debugger.
- [#12220](https://github.com/fedibtc/fedi/pull/12220) changed Android, iOS, and report release-note skills so agents translate signed-off English themselves instead of depending on a translation process or API key.
- [#12217](https://github.com/fedibtc/fedi/pull/12217) added the backport-review skill and changed Sieve review publishing so release-branch reviews use that backport guidance.
- [#11929](https://github.com/fedibtc/fedi/pull/11929) made Android bridge library installation restore writable modes even when a copy fails or is interrupted.
- [#12213](https://github.com/fedibtc/fedi/pull/12213) changed Matrix send recovery and native chat send-error handling without changing a tracked user-facing chat guide.
- [#11881](https://github.com/fedibtc/fedi/pull/11881) and [#11882](https://github.com/fedibtc/fedi/pull/11882) added `getPayAddressLimits`, typed below-minimum send errors, and UI enforcement for onchain wallet send limits.
- [#12198](https://github.com/fedibtc/fedi/pull/12198) changed user-facing naming from Wallet Service to Federation and Lightning provider to Liquidity Provider in code, localization, and tests.
- [#12256](https://github.com/fedibtc/fedi/pull/12256) synced the 26.9.2 native version bump to master.
- [#12181](https://github.com/fedibtc/fedi/pull/12181) added bounded FI/FLIP diagnostic warnings for liquidity outcomes and recovery failures.
- [#12265](https://github.com/fedibtc/fedi/pull/12265) updated `SECURITY.md` to permit only bounded FLIP support diagnostics.
- [#12219](https://github.com/fedibtc/fedi/pull/12219) updated Manifold to [8f1c2732febc0bfebdaf748ffef31460acb9f69b](https://github.com/fedibtc/manifold/commit/8f1c2732febc0bfebdaf748ffef31460acb9f69b) and switched the pinned credential input to PeerBadge SDK [ad6e954301f6684dcef14b070332d7171b61a408](https://github.com/fedibtc/peerbadge-sdk/commit/ad6e954301f6684dcef14b070332d7171b61a408).
- [#12266](https://github.com/fedibtc/fedi/pull/12266) changed Sieve hub reviews to default to `claude-opus-5-5` and pinned a newer `claude-code` package for that workflow.

## Markdown Selected For Review

- `.agents/skills/android-release/SKILL.md`
- `.agents/skills/backport-review/SKILL.md`
- `.agents/skills/ios-release/SKILL.md`
- `.agents/skills/report-next-release/references/release-notes-copy.md`
- `.sieve/review-policy.md`
- `HACKING.md`
- `SECURITY.md`
- `bridge/README.md`
- `documentation-audit-report.md`
- `scripts/ci/sieve-hub-agent-review.md`
- `ui/docs/MINI_APP_SEEDS.md`
- `ui/injections/README.md`
- `ui/native/docs/cicd.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results and PR changed-file lists for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `flake.nix`, `flake.lock`, and `Cargo.lock` for the Manifold and PeerBadge SDK inputs.
- `scripts/ci/sieve-hub-publish.sh`, `scripts/ci/sieve-hub-review.sh`, `.sieve/review-policy.md`, and `.agents/skills/backport-review/SKILL.md` for Sieve review behavior.
- `.agents/skills/android-release/SKILL.md`, `.agents/skills/ios-release/SKILL.md`, and `.agents/skills/report-next-release/references/release-notes-copy.md` for release-note guidance.
- `scripts/bridge/install-bridge-android.sh` and `bridge/README.md` for Android bridge artifact installation.
- `ui/web/src/components/MiniappApiDebugger/apis.ts`, `ui/docs/MINI_APP_SEEDS.md`, and `ui/injections/README.md` for miniapp seed and save-file APIs.
- `bridge/fedi-ffi/src/rpc.rs`, `crates/federations/src/federation_v2/wallet_ops/`, `crates/rpc-types/src/`, `ui/common/hooks/amount/`, `ui/common/utils/fedimint.ts`, and `ui/common/utils/format.ts` for onchain send limits.
- `crates/bridge/src/fi_client.rs`, `SECURITY.md`, and `HACKING.md` for FI/FLIP diagnostics and lifecycle/security wording.
- `ui/native/docs/cicd.md`, `scripts/ui/bump-version-native.sh`, and native version files for the 26.9.2 version bump.

## Findings And Changes

- `HACKING.md` was stale after [#12219](https://github.com/fedibtc/fedi/pull/12219). It still said Nix materializes a pinned Credential SDK input; current `flake.nix` materializes `peerbadge-sdk-src`. Updated the fork note to say PeerBadge SDK.
- `SECURITY.md` remains current for [#12181](https://github.com/fedibtc/fedi/pull/12181) and [#12265](https://github.com/fedibtc/fedi/pull/12265): exported FLIP diagnostics are bounded to public provider id, request id, enumerated status/outcome, and bounded error codes, while private payloads and free-form text remain excluded.
- `.agents/skills/android-release/SKILL.md`, `.agents/skills/ios-release/SKILL.md`, and `.agents/skills/report-next-release/references/release-notes-copy.md` remain current for [#12220](https://github.com/fedibtc/fedi/pull/12220): they now direct agents to translate signed-off English themselves using previous localized release notes as reference.
- `.agents/skills/backport-review/SKILL.md`, `.sieve/review-policy.md`, and `scripts/ci/sieve-hub-agent-review.md` remain current for [#12217](https://github.com/fedibtc/fedi/pull/12217) and [#12266](https://github.com/fedibtc/fedi/pull/12266).
- `bridge/README.md` remains current for [#11929](https://github.com/fedibtc/fedi/pull/11929). Its Android build description still matches the two-step build/install flow, and the writable-mode trap is an implementation hardening rather than a documented manual step.
- `ui/docs/MINI_APP_SEEDS.md` and `ui/injections/README.md` remain current for [#12230](https://github.com/fedibtc/fedi/pull/12230): seed and save-file API behavior was already documented, and the PR only expanded the debug tool surface.
- No tracked Markdown file currently documents the new `getPayAddressLimits` RPC or the onchain minimum-send UX from [#11881](https://github.com/fedibtc/fedi/pull/11881) and [#11882](https://github.com/fedibtc/fedi/pull/11882), so there was no stale user guide to correct.
- `ui/native/docs/cicd.md` remains current for [#12256](https://github.com/fedibtc/fedi/pull/12256); the version bump was produced by the documented native version workflow shape.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/android-release/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/backport-review/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/ios-release/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/report-next-release/references/release-notes-copy.md` | Reviewed; no change needed. |
| `.sieve/review-policy.md` | Reviewed; no change needed. |
| `HACKING.md` | Updated the Nix FI dependency note from Credential SDK to PeerBadge SDK. |
| `SECURITY.md` | Reviewed; no change needed. |
| `bridge/README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `scripts/ci/sieve-hub-agent-review.md` | Reviewed; no change needed. |
| `ui/docs/MINI_APP_SEEDS.md` | Reviewed; no change needed. |
| `ui/injections/README.md` | Reviewed; no change needed. |
| `ui/native/docs/cicd.md` | Reviewed; no change needed. |

## Validation

- Ran `git ls-files '*.md'` and counted 102 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs and changed files with GitHub read APIs.
- Verified selected documentation against current scripts, security policy, bridge/FI implementation files, miniapp API implementation, native versioning files, and dependency pins with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout does not contain [15c8bf5e0c6ed67c26e1671dc53d6b98ff406b7a](https://github.com/fedibtc/fedi/commit/15c8bf5e0c6ed67c26e1671dc53d6b98ff406b7a), and the unauthenticated Git remote cannot fetch private history. Changed-file scope was therefore built from GitHub run and PR metadata rather than a local `git diff` against [15c8bf5e0c6ed67c26e1671dc53d6b98ff406b7a](https://github.com/fedibtc/fedi/commit/15c8bf5e0c6ed67c26e1671dc53d6b98ff406b7a).
