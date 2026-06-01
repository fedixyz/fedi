# Documentation Audit Report

Review date: 2026-06-01

## Scope

- Review mode: full-scope fallback.
- Boundary: no previous successful `Weekly Documentation Updater` run was available for workflow ID `286820929`; the current run is run number 1 for `.github/workflows/weekly-doc-updater.lock.yml`.
- Current head: `5fcfd2a39a2e44d740a32d81190e01b74323a5c6` (`test(chat): cover invite-only path when allowKnocking is disabled (#11142)`).
- Changed files or PRs driving scope: none. The full tracked Markdown inventory was selected because there was no prior successful run boundary.
- Tracked Markdown inventory before this run's report was added: 73 files from `git ls-files '*.md'`.
- This run adds `documentation-audit-report.md`, so the inventory will be 74 tracked Markdown files after merge.

## Implementation Sources Checked

- GitHub Actions workflow metadata for the current and previous updater runs.
- `.github/workflows/*.yml` and `.github/workflows/weekly-doc-updater.md`.
- Native release, upload, Google Play, TestFlight, UI checks, and version bump workflows.
- `scripts/ui/bump-version-native.sh`, `scripts/ui/deploy-to-testflight.sh`, and supporting CI scripts.
- `ui/native/android/fastlane/Fastfile` and `ui/native/ios/fastlane/Fastfile`.
- Native and common UI source paths referenced by README links.
- Meta-field definitions in `ui/common/types/fedimint.ts` and parsing in `ui/common/utils/FederationUtils.ts`.

## Findings and Changes

- Fixed broken internal documentation links in `ui/common/README.md`.
- Fixed broken and stale relative links in `ui/native/README.md`, including old `fedi-react-native` bridge links, incorrect `./native/...` paths, and the renamed iOS `AppDelegate.mm` path.
- Fixed missing meta-field reference targets in `ui/docs/meta_fields/README.md` by pointing popup message fields to the file that documents them.
- Refreshed `ui/native/docs/cicd.md` for current workflow names, current APK/release channels, current version bump behavior, and current local iOS signing/deployment references.
- Updated committed Fastlane reference docs for newer Android Nova lanes and iOS Nova/certificate lanes present in the Fastfiles.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/agent-browser/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/agent-browser/references/authentication.md` | Reviewed; no change needed. |
| `.agents/skills/agent-browser/references/commands.md` | Reviewed; no change needed. |
| `.agents/skills/agent-browser/references/profiling.md` | Reviewed; no change needed. |
| `.agents/skills/agent-browser/references/proxy-support.md` | Reviewed; no change needed. |
| `.agents/skills/agent-browser/references/session-management.md` | Reviewed; no change needed. |
| `.agents/skills/agent-browser/references/snapshot-refs.md` | Reviewed; no change needed. |
| `.agents/skills/agent-browser/references/video-recording.md` | Reviewed; no change needed. |
| `.agents/skills/android-emulator/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/feature-flags/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/appium-running-ci.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/appium-running-local.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/appium-writing.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/integration-common-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/integration-native-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/integration-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/integration-web-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/mock-builders.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/unit-common-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/unit-native-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/unit-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/fedi-ui-test-patterns/references/unit-web-patterns.md` | Reviewed; no change needed. |
| `.agents/skills/ios-emulator/SKILL.md` | Reviewed; no change needed. |
| `.github/ISSUE_TEMPLATE/custom.md` | Reviewed; no change needed. |
| `.github/PULL_REQUEST_TEMPLATE.md` | Reviewed; no change needed. |
| `.github/workflows/daily-e2e-coverage-check.md` | Reviewed; no change needed. |
| `.github/workflows/weekly-doc-updater.md` | Reviewed; no change needed. |
| `README.md` | Reviewed; no change needed. |
| `SECURITY.md` | Reviewed; no change needed. |
| `bridge/README.md` | Reviewed; no change needed. |
| `bridge/debugging.md` | Reviewed; no change needed. |
| `bridge/fedi-swift/README.md` | Reviewed; no change needed. |
| `crates/debug-tools/README.md` | Reviewed; no change needed. |
| `crates/modules/fedi-social/README.md` | Reviewed; no change needed. |
| `crates/modules/stability-pool-old/README.md` | Reviewed; preserved as old module documentation. |
| `crates/modules/stability-pool/README.md` | Reviewed; no change needed. |
| `ui/README.md` | Reviewed; no change needed. |
| `ui/common/README.md` | Updated broken links. |
| `ui/common/STORAGE_MIGRATION_GUIDE.md` | Reviewed; no change needed. |
| `ui/common/scripts/README.md` | Reviewed; no change needed. |
| `ui/common/wasm/README.md` | Reviewed; no change needed. |
| `ui/docs/LINKING.md` | Reviewed; no change needed. |
| `ui/docs/TESTING.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/README.md` | Updated popup message links. |
| `ui/docs/meta_fields/chat_server_domain.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/default_currency.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/default_group_chats.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/federation_icon_url.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/fedi_internal_injection_disabled.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/fedimods.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/invite_codes_disabled.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/max_balance_msats.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/max_invoice_msats.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/max_stable_balance_msats.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/new_members_disabled.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/offline_wallet_disabled.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/onchain_deposits_disabled.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/pinned_message.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/popup_end_timestamp.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/social_recovery_disabled.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/stability_pool_disabled.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/tos_url.md` | Reviewed; no change needed. |
| `ui/docs/meta_fields/welcome_message.md` | Reviewed; no change needed. |
| `ui/injections/README.md` | Reviewed; no change needed. |
| `ui/native/README.md` | Updated broken and stale source links. |
| `ui/native/android/fastlane/README.md` | Updated generated lane reference for Nova lanes. |
| `ui/native/docs/chat-features.md` | Reviewed; preserved as explicitly deprecated reference material. |
| `ui/native/docs/cicd.md` | Updated stale workflow, versioning, and local build references. |
| `ui/native/docs/development-plan.md` | Reviewed; preserved as historical planning material. |
| `ui/native/ios/fastlane/README.md` | Updated generated lane reference for Nova and certificate lanes. |
| `ui/native/tests/README.md` | Reviewed; no change needed. |
| `ui/web/src/pages/api/bug-report/README.md` | Reviewed; no change needed. |

## Validation

- Ran a tracked Markdown inventory with `git ls-files '*.md'`.
- Ran a local Markdown link-target scan for repository-relative links; no missing local targets remain.
- Cross-checked current workflow names and paths against `.github/workflows/`.
- Cross-checked Fastlane README lane lists against Android and iOS Fastfiles.
- Cross-checked popup meta fields against `SupportedMetaFields` and `FederationUtils`.

## Unresolved Areas

- `ui/native/docs/chat-features.md` is explicitly deprecated and still references historical `fedi-react-native` commit URLs. It was preserved intentionally rather than rewritten as current chat architecture.
- `ui/native/docs/development-plan.md` appears to be historical planning material. It was checked for obvious stale links and left unchanged.
