# Documentation Audit Report

Review date: 2026-10-05

## Scope

- Review mode: incremental.
- Current workflow run: [37267106029](https://github.com/fedibtc/fedi/actions/runs/37267106029), `Weekly Documentation Updater`, head [259e1866a45c987c4beaa6bc0268c68aea6f7b9e](https://github.com/fedibtc/fedi/commit/259e1866a45c987c4beaa6bc0268c68aea6f7b9e).
- Previous successful run: [36379899685](https://github.com/fedibtc/fedi/actions/runs/36379899685), completed 2026-09-28T05:04:19Z at [cd798fc9d069c9702908bf25e9590f2dc1a901a1](https://github.com/fedibtc/fedi/commit/cd798fc9d069c9702908bf25e9590f2dc1a901a1).
- Boundary used: repository changes after [36379899685](https://github.com/fedibtc/fedi/actions/runs/36379899685) through current head [259e1866a45c987c4beaa6bc0268c68aea6f7b9e](https://github.com/fedibtc/fedi/commit/259e1866a45c987c4beaa6bc0268c68aea6f7b9e), based on GitHub Actions run history, merged PR metadata, and PR changed-file lists.
- Tracked Markdown inventory: 102 files.

## Changed Areas Driving Review

Key merged PRs mapped to tracked docs:

- [#12268](https://github.com/fedibtc/fedi/pull/12268) merged the previous updater report and changed `HACKING.md` plus this audit report.
- [#12272](https://github.com/fedibtc/fedi/pull/12272) translated the 26.9.2 Federation wording across locales.
- [#12271](https://github.com/fedibtc/fedi/pull/12271) added bridge and native tests proving LNURL support from both native JSON and string-wrapped federation meta.
- [#12276](https://github.com/fedibtc/fedi/pull/12276) added bounded FI resume diagnostics.
- [#12269](https://github.com/fedibtc/fedi/pull/12269) added the wallet-service DKG restart RPC, remote flag, native hidden UI, simulator support, and generated bindings.
- [#12294](https://github.com/fedibtc/fedi/pull/12294) turned the DKG restart flag on in production.
- [#12296](https://github.com/fedibtc/fedi/pull/12296) changed bug-report and analytics S3 uploads to prefer Vercel OIDC through `AWS_ROLE_ARN`, with static AWS keys as the fallback.
- [#12299](https://github.com/fedibtc/fedi/pull/12299) changed release skills so agents write GitHub draft release bodies without asking for sign-off.
- [#12297](https://github.com/fedibtc/fedi/pull/12297) changed chat-payment receive UI for ecash from a federation the recipient has not joined.
- [#12285](https://github.com/fedibtc/fedi/pull/12285) changed shared amount-input validation and expanded native/web E2E payment coverage across kind-one and kind-two federations.

## Markdown Selected For Review

- `.agents/skills/android-release/SKILL.md`
- `.agents/skills/feature-flags/SKILL.md`
- `.agents/skills/report-next-release/references/release-notes-copy.md`
- `.agents/skills/web-release/SKILL.md`
- `HACKING.md`
- `SECURITY.md`
- `documentation-audit-report.md`
- `ui/docs/TESTING.md`
- `ui/docs/meta_fields/README.md`
- `ui/native/docs/cicd.md`
- `ui/native/tests/README.md`
- `ui/web/src/pages/api/bug-report/README.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results and PR changed-file lists for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `.github/workflows/e2e-tests.yml`, `scripts/ci/e2e-pipeline.sh`, `scripts/ui/run-e2e-web.sh`, `ui/native/tests/appium/common/payments.test.ts`, and `ui/web/tests/e2e/payments.spec.ts` for E2E behavior and federation-kind coverage.
- `ui/web/src/pages/api/bug-report/generate-upload-url.ts`, `ui/web/src/pages/api/analytics/consent.ts`, and `ui/web/package.json` for S3 upload credential behavior.
- `crates/runtime/src/features.rs`, `ui/web/src/pages/api/features.ts`, `ui/common/types/bindings.ts`, `ui/native/screens/WalletServiceProgress.tsx`, and `.agents/skills/feature-flags/SKILL.md` for the DKG restart feature flag.
- `crates/bridge/src/fi_client.rs`, `SECURITY.md`, and `HACKING.md` for FI lifecycle and diagnostics wording.
- `.agents/skills/android-release/SKILL.md`, `.agents/skills/web-release/SKILL.md`, and `.agents/skills/report-next-release/references/release-notes-copy.md` for release-note sign-off behavior.
- `ui/common/hooks/chat.ts`, native/web foreign-ecash overlays, and `ui/native/tests/appium/common/chatPayments.test.ts` for chat-payment receive behavior.
- `ui/docs/meta_fields/README.md` and the LNURL-related bridge tests for federation meta documentation.

## Findings And Changes

- `ui/web/src/pages/api/bug-report/README.md` was stale after [#12296](https://github.com/fedibtc/fedi/pull/12296). It still required static `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` credentials only. Updated it to document `AWS_ROLE_ARN` as the Vercel OIDC path and static keys as the fallback.
- `ui/docs/TESTING.md` and `ui/native/docs/cicd.md` were stale after [#12285](https://github.com/fedibtc/fedi/pull/12285). They did not mention `FEDI_FEDERATION_KIND`, the kind-one/kind-two CI matrix, the kind-two payments narrowing, or kind-specific artifacts. Updated both docs.
- `.agents/skills/android-release/SKILL.md`, `.agents/skills/web-release/SKILL.md`, and `.agents/skills/report-next-release/references/release-notes-copy.md` remain current for [#12299](https://github.com/fedibtc/fedi/pull/12299): store copy still needs sign-off, while GitHub draft release bodies are written without asking.
- `.agents/skills/feature-flags/SKILL.md` remains current for [#12269](https://github.com/fedibtc/fedi/pull/12269) and [#12294](https://github.com/fedibtc/fedi/pull/12294): it already describes the Rust/web/bindings split, camelCase API fields, snake_case selectors, generated bindings, and production/dev defaults.
- `SECURITY.md` and `HACKING.md` remain current for [#12276](https://github.com/fedibtc/fedi/pull/12276): FI resume diagnostics log bounded status by default and include full error detail only behind sensitive logging.
- `ui/docs/meta_fields/README.md` remains current for [#12271](https://github.com/fedibtc/fedi/pull/12271). The PR added coverage for existing LNURL meta decoding behavior rather than introducing a new documented Fedi-specific meta field.
- `ui/native/tests/README.md` remains current for the native Appium changes. The interactive suite list already includes `payments` and `chatPayments`, and the federation-kind matrix is CI workflow behavior documented in `ui/native/docs/cicd.md`.

## Per-Document Status

| File | Status |
| --- | --- |
| `.agents/skills/android-release/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/feature-flags/SKILL.md` | Reviewed; no change needed. |
| `.agents/skills/report-next-release/references/release-notes-copy.md` | Reviewed; no change needed. |
| `.agents/skills/web-release/SKILL.md` | Reviewed; no change needed. |
| `HACKING.md` | Reviewed; no change needed. |
| `SECURITY.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `ui/docs/TESTING.md` | Updated web E2E federation-kind and CI matrix behavior. |
| `ui/docs/meta_fields/README.md` | Reviewed; no change needed. |
| `ui/native/docs/cicd.md` | Updated native/web E2E kind-one/kind-two CI behavior. |
| `ui/native/tests/README.md` | Reviewed; no change needed. |
| `ui/web/src/pages/api/bug-report/README.md` | Updated S3 credential setup for Vercel OIDC and static-key fallback. |

## Validation

- Ran `git ls-files '*.md'` and counted 102 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs and changed files with GitHub read APIs.
- Verified selected documentation against current workflows, scripts, API route implementation, feature-flag implementation, bridge/FI diagnostics, release-skill docs, and relevant UI test files with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout does not contain [cd798fc9d069c9702908bf25e9590f2dc1a901a1](https://github.com/fedibtc/fedi/commit/cd798fc9d069c9702908bf25e9590f2dc1a901a1), and the unauthenticated Git remote cannot fetch private history. Changed-file scope was therefore built from GitHub run and PR metadata rather than a local `git diff` against [cd798fc9d069c9702908bf25e9590f2dc1a901a1](https://github.com/fedibtc/fedi/commit/cd798fc9d069c9702908bf25e9590f2dc1a901a1).
