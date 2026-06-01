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

Your job is to review the native Appium e2e test suite against recent product and navigation changes and identify user-facing flows that should have e2e coverage.

This workflow is audit-only. Do not modify files, add tests, add selectors, add fixtures, update reports, create branches, or create pull requests. If concrete e2e coverage gaps are found, report them by creating a single issue. If no concrete gap is found, exit without changes.

Default to an incremental review based on repository changes since the last successful run of this workflow, in order to reduce token usage and avoid noisy test churn.

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

## Incremental Scope Policy

By default, review only the changes since the previous successful run of this workflow.

Use GitHub tools to:

1. Find the previous successful run of this workflow.
2. Determine the comparison boundary using its completion time, commit SHA, or both.
3. Gather merged pull requests, commits, and changed files since that boundary.
4. Map changed files to likely e2e coverage needs.

Fallback rules:

- If there is no previous successful run, perform a full review of the Appium e2e test surface.
- If run-history lookup fails, compare recent merged pull requests and changed files conservatively.
- If a foundational navigation, fixture, or runner file changed, expand the review to the full Appium suite and runner entry points.
- If changed files clearly do not affect user-facing native behavior, exit without changes.

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
2. Use incremental review since the last successful run unless a fallback rule applies.
3. Do not add or edit Appium tests, fixtures, selectors, product code, workflow files, shell scripts, package metadata, or reports.
4. If a concrete coverage gap exists, describe the missing workflow, why existing tests do not cover it, and the smallest recommended follow-up test.
5. If the gap would require new fixture state, selectors, or product decisions, describe that prerequisite instead of making the change.
6. Prefer `testID` or accessibility ID selectors when recommending future test coverage.
7. Do not update package manager lockfiles or broad dependency metadata.

## Review Process

### 1. Determine Review Scope

First, determine the incremental review scope.

Use GitHub tools to identify:

- the most recent successful run of this workflow before the current run
- the merged pull requests, commits, and changed files since that point
- the changed native screens, components, common code, test files, or runner scripts that can affect e2e coverage

Record that scope in working notes and summarize it in the final workflow response.

### 2. Inventory Existing Coverage

Inspect:

- `ui/native/tests/appium/runner.ts` and its `availableTests` map
- every test in `ui/native/tests/appium/common/`
- registered fixtures in `ui/native/tests/appium/fixtures/`
- `.github/workflows/e2e-tests.yml` test input options
- `scripts/ui/run-e2e.sh` interactive test list

Create a short coverage map in your working notes that connects existing tests to the user workflows they cover.

### 3. Compare Changed User Flows To Existing Tests

For each changed user-facing flow:

- identify the entry point and expected user journey
- determine whether an existing Appium test already exercises it
- check whether unit or integration tests already cover the risk well enough
- decide whether the missing coverage is concrete, speculative, or not needed

Concrete gaps should be reported as recommended follow-up work. Speculative gaps should be reported only when the missing coverage is important enough for a human to decide.

### 4. Report Findings

For each meaningful gap, include:

- the changed user-facing flow
- the existing e2e tests reviewed
- why those tests do not cover the flow
- the recommended Appium test name and target file
- any selector, fixture, or product decision needed before implementation

Do not implement the recommended test.

### 5. Final Audit Output

The final workflow response should include:

- review date
- whether the run was incremental or full-scope
- comparison boundary used
- changed files or pull requests that drove the scope
- existing e2e coverage map
- coverage gaps found
- recommended follow-up tests or prerequisites
- validation performed while auditing, or why validation was not run

### 6. No Code Changes

This workflow must not create pull requests, commit repository changes, or modify files. If no meaningful e2e coverage gaps are found, exit without changes. If gaps are found, report them by creating a single issue with a concise audit summary.

## Exit Conditions

- If no meaningful e2e coverage gaps are found, exit without changes.
- If all gaps are already covered by unit or integration tests, exit without changes.
- If there are only speculative or low-value gaps, exit without changes.
