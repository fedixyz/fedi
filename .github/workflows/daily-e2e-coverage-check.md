---
on:
  workflow_dispatch:
  schedule: daily

permissions:
  actions: read
  contents: read
  issues: read
  pull-requests: read

tracker-id: daily-e2e-coverage-check
engine:
  id: codex
  model: gpt-5-codex
strict: true

network:
  allowed:
    - defaults
    - github

safe-outputs:
  create-issue:
    max: 1
    title-prefix: "[e2e audit] "
    labels: [testing, "e2e testing", "ai generated"]
  noop:
    report-as-issue: false

tools:
  cache-memory: true
  github:
    toolsets: [default, actions]
  bash:
    - "find"
    - "cat"
    - "sed"
    - "rg"
    - "git"

---

# Daily E2E Coverage Check

You are an AI e2e test coverage agent for this repository.

Your job is to review the native Appium e2e test suite against the full user-facing codebase and identify important user flows that should have e2e coverage.

This workflow is audit-only. Do not modify files, add tests, add selectors, add fixtures, update reports, create branches, or create pull requests. If concrete e2e coverage gaps are found, report them by creating a single issue. If no concrete gap is found, emit a `noop` safe output with the required audit evidence and state that `coverage_gaps` has no concrete gaps.

The workflow appends a deterministic e2e audit context to the prompt before the agent runs. Base the audit on that context. Any `create_issue` or `noop` safe output must include the exact `audit_context_id` from the deterministic context and these labels: `review_scope`, `comparison_boundary`, `changed_files`, `appium_tests_inspected`, `native_surface_inventory`, `coverage_map`, `coverage_gaps`, and `validation_performed`.

Plain text final responses are invalid for this workflow. If the deterministic context is missing or the audit cannot continue, use `missing_data` or `report_incomplete` and describe the blocker plus the last successful inspection step.

Do not use `noop` when any concrete coverage gap is found. A `noop` is valid only when `coverage_gaps` explicitly states no concrete gaps. If `coverage_gaps` lists missing payment, scanner, PIN, stability pool, federation, chat, onboarding, recovery, settings, navigation, or other user-facing workflows, you must use `create_issue`.

Always perform a full-codebase review of the native user-facing surface. Recent changes and previous run data are supporting context only; they must not limit the review scope.

## Mission

Review e2e coverage for these areas:

- Native Appium e2e test suite
  - `ui/native/tests/appium/runner.ts`
  - `ui/native/tests/appium/common/*.test.ts`
  - `ui/native/tests/appium/fixtures/*.ts`
  - `ui/native/tests/configs/appium/*.ts`
- E2E runner entry points
  - `.github/workflows/e2e-tests.yml`
  - `scripts/ci/e2e-pipeline.sh`
  - `scripts/ui/run-e2e.sh`
  - `scripts/ui/run-android-e2e.sh`
  - `scripts/ui/run-ios-e2e.sh`
- Native user-facing implementation
  - `ui/native/screens/**`
  - `ui/native/components/**`
  - `ui/native/state/**`
  - `ui/native/utils/**`
  - `ui/common/**` files that drive native user flows

The current Appium suite is class-based. It does not use Jest. Tests live in `ui/native/tests/appium/common/`, extend `AppiumTestBase`, implement a single `execute()` method, and fail by throwing an error.

## Full-Codebase Scope Policy

Review the full native user-facing surface every time this workflow runs.

Use the deterministic context and repository files to:

1. Confirm `review_scope=full-codebase`.
2. Inventory existing Appium e2e coverage.
3. Inventory the native user-facing screens, feature components, app shell/navigation, state, utilities, and common flow logic listed in `native_surface_inventory`.
4. Map important user-facing workflows in that full native surface to existing Appium tests.
5. Use changed files, commits, merged pull requests, and previous run data only as secondary context.

Fallback rules:

- If run-history lookup fails, continue with a full-codebase review.
- If the deterministic native surface inventory is incomplete, inspect the repository paths directly with shell tools.
- Do not emit `noop` merely because changed files do not affect user-facing native behavior.
- Emit `noop` only after comparing the full native user-facing surface to the existing Appium suite and finding no concrete coverage gaps.

## What Counts As An E2E Coverage Gap

Treat a flow as a good e2e candidate when all of these are true:

1. It is user-facing native behavior.
2. It crosses screens, navigation state, persisted state, platform UI, bridge state, or multiple feature boundaries.
3. Unit or integration tests alone cannot adequately prove the user workflow.
4. The flow can be driven deterministically from a fresh install or a documented fixture state.
5. The required selectors are stable `testID` or accessibility IDs, or can be added with a small focused change.

Strong candidates include:

- onboarding, recovery, backup, and PIN flows
- federation join, leave, settings, and wallet switching flows
- send, receive, ecash, lightning, on-chain, and offline payment flows
- chat room creation, room settings, message composition, invites, and timeline behavior
- settings flows that affect visible app state
- regressions in bottom-tab navigation, overlays, deep links, or permission prompts

Do not add e2e tests for:

- pure styling changes that do not affect important element positioning or visibility
- one-off configuration changes
- implementation details that are already better covered by unit or integration tests
- flows that require unstable external services and cannot be made deterministic
- hidden, deprecated, or intentionally unreachable screens

## Requirements

1. Inspect the current e2e suite and runner before deciding coverage is missing.
2. Review the full native user-facing codebase every run; do not limit the audit to recent changes.
3. Do not add or edit Appium tests, fixtures, selectors, product code, workflow files, shell scripts, package metadata, or reports.
4. If a concrete coverage gap exists, describe the missing workflow, why existing tests do not cover it, and the smallest recommended follow-up test.
5. If the gap would require new fixture state, selectors, or product decisions, describe that prerequisite instead of making the change.
6. Prefer `testID` or accessibility ID selectors when recommending future test coverage.
7. Do not update package manager lockfiles or broad dependency metadata.

## Review Process

### 1. Confirm Review Scope

First, confirm that this is a full-codebase review.

Use the deterministic context to identify:

- review_scope
- comparison boundary, changed files, merged pull requests, and commits as supporting context
- native_surface_inventory paths that define the user-facing review surface

Record the scope in working notes and summarize it in the final safe output. The final safe output must explicitly say `review_scope=full-codebase`.

### 2. Inventory Existing Coverage

Inspect:

- `ui/native/tests/appium/runner.ts` and its `availableTests` map
- every test in `ui/native/tests/appium/common/`
- registered fixtures in `ui/native/tests/appium/fixtures/`
- `.github/workflows/e2e-tests.yml` test input options
- `scripts/ui/run-e2e.sh` interactive test list

Create a short coverage map in your working notes that connects existing tests to the user workflows they cover.

### 3. Compare Full Native User Flows To Existing Tests

For important user-facing flows found in the full native surface:

- identify the entry point and expected user journey
- determine whether an existing Appium test already exercises it
- check whether unit or integration tests already cover the risk well enough
- decide whether the missing coverage is concrete, speculative, or not needed

Concrete gaps should be reported as recommended follow-up work. Speculative gaps should be reported only when the missing coverage is important enough for a human to decide.

If one or more concrete gaps are found, the final safe output must be `create_issue`, not `noop`.

### 4. Report Findings

For each meaningful gap, include:

- the user-facing flow
- the existing e2e tests reviewed
- why those tests do not cover the flow
- the recommended Appium test name and target file
- any selector, fixture, or product decision needed before implementation

Do not implement the recommended test.

### 5. Final Audit Output

The final safe output should include:

- review date
- review_scope=full-codebase
- exact audit_context_id
- comparison boundary used
- changed files or pull requests reviewed as supporting context
- native surface inventory reviewed
- existing e2e coverage map
- coverage gaps found
- recommended follow-up tests or prerequisites
- validation performed while auditing, or why validation was not run

### 6. No Code Changes

This workflow must not create pull requests, commit repository changes, or modify files. If no meaningful e2e coverage gaps are found, emit a `noop` safe output with the required audit evidence and `coverage_gaps=no concrete gaps`. If concrete gaps are found, report them by creating a single issue with a concise audit summary and the required audit evidence.

## Exit Conditions

- If no meaningful e2e coverage gaps are found, emit a `noop` safe output with the required audit evidence.
- If all gaps are already covered by unit or integration tests, emit a `noop` safe output with the required audit evidence.
- If there are only speculative or low-value gaps, emit a `noop` safe output with the required audit evidence.
