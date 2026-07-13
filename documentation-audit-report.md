# Documentation Audit Report

Review date: 2026-07-13

## Scope

- Review mode: incremental.
- Current workflow run: `29227493245`, `Weekly Documentation Updater`, run 7, head
  `0c3b474fd8dfdff0eaef664d5f7ae9c618332257`.
- Previous successful run: `28771983481`, completed 2026-07-06T06:23:45Z at
  `750bb569aca961472aec7be29c32adb6a66e28d2`.
- Boundary used: repository changes after the previous successful updater run through the current
  head. The local checkout only contained the current head, so GitHub Actions, commit, PR, and PR
  file APIs were used for the incremental map.
- Tracked Markdown inventory: 87 files.

## Changed Areas Driving Review

Key merged PRs and commits mapped to tracked docs:

- #11683 expanded the root `README.md`, added `HACKING.md`, and rewrote `bridge/README.md`.
- #11672 changed the daily e2e coverage audit prompt and
  `scripts/ci/build-e2e-audit-context.mjs` to dedupe against all open issues labeled
  `e2e testing`.
- #11571 added v2 Fedimint module routing, Lightning gateway ID changes, v2 ecash cancel handling,
  and bumped Fedimint to `v0.11.0-fedi7`.
- #11561 changed native/common default chat and room-knocking behavior for community chat tiles.
- #11688 changed web room members behavior so pending join requests can open the Pending tab first.
- #11658 bumped native app versions to `26.6.1`; no tracked Markdown describes a pinned current
  native version.

## Markdown Selected For Review

- `.github/workflows/daily-e2e-coverage-check.md`
- `HACKING.md`
- `README.md`
- `bridge/README.md`
- `documentation-audit-report.md`
- `ui/native/docs/chat-features.md`

## Implementation Sources Checked

- GitHub Actions run history for workflow ID `286820929`.
- GitHub commit list and merged PR file lists for the incremental interval.
- `git ls-files '*.md'` for the tracked Markdown inventory.
- `bridge/fedi-ffi/src/fedi.udl` and `bridge/fedi-ffi/src/ffi.rs` for the current FFI boundary.
- `scripts/ci/build-e2e-audit-context.mjs` and `.github/workflows/daily-e2e-coverage-check.md`.
- `bridge/README.md`, `README.md`, and `HACKING.md` against current repo layout and bridge build
  scripts.
- Chat-related docs search across `ui/docs`, `ui/native/docs`, and workspace README files.

## Findings And Changes

- `HACKING.md` still described the RPC boundary as two functions and omitted
  `fedimint_get_supported_events`, while `bridge/fedi-ffi/src/fedi.udl` now exposes three functions
  plus `EventSink`. Updated the section to match the UDL and to direct UI code to enumerate events
  via `fedimint_get_supported_events`.
- `HACKING.md` also said Android bridge builds outside Nix need hand-set `ANDROID_NDK_ROOT` values
  and referred to NDK linker workarounds, but the current `bridge/README.md` says outside-Nix bridge
  builds are unsupported and documents the Nix-provided SDK/NDK/toolchain path. Updated the
  contributor guide to match.
- `README.md` and `bridge/README.md` already describe the three-function FFI surface, current
  Fedimint fork tag, v1/v2 Stability Pool naming, and supported bridge build flow.
- `.github/workflows/daily-e2e-coverage-check.md` already matches the current context builder's
  `Open E2E Coverage Issues`, `tracked_coverage_gap_keys`, and `e2e testing` label dedupe behavior.
- `ui/native/docs/chat-features.md` is explicitly deprecated historical XMPP documentation, so the
  Matrix room-knocking/default-chat changes were intentionally not folded into it.

## Per-Document Status

| File | Status |
| --- | --- |
| `.github/workflows/daily-e2e-coverage-check.md` | Reviewed; no change needed. |
| `HACKING.md` | Updated for the current FFI boundary and supported bridge build assumptions. |
| `README.md` | Reviewed; no change needed. |
| `bridge/README.md` | Reviewed; no change needed. |
| `documentation-audit-report.md` | Updated for this incremental run. |
| `ui/native/docs/chat-features.md` | Reviewed as intentionally deprecated; no change made. |

## Validation

- Ran `git ls-files '*.md'` and counted the tracked Markdown inventory.
- Cross-checked the previous successful updater run with the GitHub Actions API.
- Cross-checked recent commits and selected PR file lists through GitHub read APIs because the local
  git checkout was shallow.
- Verified edited documentation against current local code with `rg`, `sed`, and direct file reads.
- No test suite was run because the changes are Markdown-only.

## Unresolved Areas

- The chat changes in #11561 and #11688 affect user-facing behavior, but the only tracked chat
  architecture document found in the selected search area is explicitly deprecated. No current
  request-to-join guide exists to update.
