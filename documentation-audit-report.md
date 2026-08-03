# Documentation Audit Report

Review date: 2026-08-03

## Scope

- Review mode: incremental.
- Current workflow run: [30788669204](https://github.com/fedibtc/fedi/actions/runs/30788669204), `Weekly Documentation Updater`, head [694842969950419721a0e931297f3b4c1e380dc8](https://github.com/fedibtc/fedi/commit/694842969950419721a0e931297f3b4c1e380dc8).
- Previous successful run: [30241518535](https://github.com/fedibtc/fedi/actions/runs/30241518535), completed 2026-07-27T06:10:19Z at [df5e8db3507a4a8a50289de554f2f60d6278f1c7](https://github.com/fedibtc/fedi/commit/df5e8db3507a4a8a50289de554f2f60d6278f1c7).
- Boundary used: repository changes after [30241518535](https://github.com/fedibtc/fedi/actions/runs/30241518535) through current head [694842969950419721a0e931297f3b4c1e380dc8](https://github.com/fedibtc/fedi/commit/694842969950419721a0e931297f3b4c1e380dc8), based on GitHub Actions run history, merged PR metadata, and commit metadata.
- Tracked Markdown inventory: 93 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- [#11797](https://github.com/fedibtc/fedi/pull/11797) updated the weekly documentation updater prompt so audit-report references must be explicit Markdown links.
- [#11729](https://github.com/fedibtc/fedi/pull/11729) added the Sieve CLI to the dev shell and introduced `.sieve/review-policy.md`.
- [#11785](https://github.com/fedibtc/fedi/pull/11785) removed the LN router and made bridge test federations all-v1 or all-v2 instead of mixed-generation.
- [#11755](https://github.com/fedibtc/fedi/pull/11755) fixed in-flight lnv2 transaction history behavior.
- [#11825](https://github.com/fedibtc/fedi/pull/11825) added kind-two bridge coverage for walletv2 on-chain behavior and mintv2 offline behavior, plus Stability Pool v2 invariants.
- [#11826](https://github.com/fedibtc/fedi/pull/11826), [#11828](https://github.com/fedibtc/fedi/pull/11828), [#11831](https://github.com/fedibtc/fedi/pull/11831), [#11832](https://github.com/fedibtc/fedi/pull/11832), and [#11834](https://github.com/fedibtc/fedi/pull/11834) changed the Sieve hub review workflow and agent prompt.

## Markdown Selected For Review

- `.sieve/review-policy.md`
- `HACKING.md`
- `bridge/README.md`
- `bridge/debugging.md`
- `crates/modules/stability-pool/README.md`
- `crates/modules/stability-pool-old/README.md`
- `documentation-audit-report.md`
- `scripts/ci/sieve-hub-agent-review.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub merged PR search results and commit list for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `justfile.fedi`, `scripts/test-bridge.sh`, `scripts/test-bridge-kind-two.sh`, and `scripts/bridge/launch-remote.sh` for bridge test commands and federation-kind behavior.
- `bridge/fedi-ffi/src/rpc/tests.rs`, `crates/federations/src/federation_v2/mod.rs`, and `crates/federations/src/federation_v2/ln_ops/v2.rs` for kind-two bridge coverage and lnv2 transaction history behavior.
- `.github/workflows/sieve-hub-review.yml`, `scripts/ci/sieve-hub-review.sh`, `scripts/ci/sieve-hub-agent-review.md`, and `.sieve/review-policy.md` for Sieve hub review behavior.
- `crates/modules/stability-pool/tests/tests/tests.rs` and the Stability Pool README files for the v2 invariant-test additions.

## Findings And Changes

- `bridge/README.md` was stale. It said the bridge test federation enabled Lightning v2 by default, but `scripts/test-bridge.sh` now runs kind-one as pure v1 and explicitly sets `FM_ENABLE_MODULE_LNV2=0`; kind-two coverage lives behind `just test-bridge-kind-two`. Updated the testing section with the current default and kind-two commands.
- `HACKING.md` listed only `just test-bridge [testcase]`, which missed the new `just test-bridge-kind-two [testcase]` entry point from `justfile.fedi`. Added the kind-two bridge test command and clarified that the default command is the kind-one suite.
- `.sieve/review-policy.md` matches the current dev-shell Sieve CLI addition and repo skill routing guidance.
- `scripts/ci/sieve-hub-agent-review.md` matches the current hub workflow: the agent authors `sieve-recap.json`, validates with `sieve publish --dry-run --redact`, supports dependency-source fetches, and reflects the current verdict, evidence-block, and altitude rules.
- Stability Pool docs remain current for the reviewed test-only v2 invariant additions; no user-facing module behavior changed.

## Per-Document Status

| File | Status |
| --- | --- |
| `.sieve/review-policy.md` | Reviewed; no change needed. |
| `HACKING.md` | Updated with `just test-bridge-kind-two [testcase]` and clarified the default bridge suite. |
| `bridge/README.md` | Updated for kind-one default bridge tests, explicit lnv2 disabling, and kind-two test commands. |
| `bridge/debugging.md` | Reviewed; no change needed. |
| `crates/modules/stability-pool/README.md` | Reviewed; no change needed. |
| `crates/modules/stability-pool-old/README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `scripts/ci/sieve-hub-agent-review.md` | Reviewed; no change needed. |

## Validation

- Ran `git ls-files '*.md'` and counted 93 tracked Markdown files.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent merged PRs and commits with GitHub read APIs.
- Verified edited documentation against the current bridge test scripts, just recipes, Sieve workflow, and implementation files with `rg` and `sed`.
- Ran `git diff --check`.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The local checkout is shallow at [694842969950419721a0e931297f3b4c1e380dc8](https://github.com/fedibtc/fedi/commit/694842969950419721a0e931297f3b4c1e380dc8), so changed-file scope was built from GitHub run, PR, and commit metadata rather than a local `git diff` against [df5e8db3507a4a8a50289de554f2f60d6278f1c7](https://github.com/fedibtc/fedi/commit/df5e8db3507a4a8a50289de554f2f60d6278f1c7).
