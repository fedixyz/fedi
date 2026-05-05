# Running Appium E2E Tests Locally

How to run the Appium suite against an emulator or simulator on your machine.

For writing tests, see `references/appium-writing.md`. For dispatching tests in CI (including as a fallback when the local run is wedged), see `references/appium-running-ci.md`.

---

## Prerequisites

- Nix shell active — the run scripts will enforce this via `enforce-nix.sh`
- An Android emulator or iOS simulator available; the script will boot one if needed
- Metro and Appium must NOT be already running on their default ports — the script starts them

The run scripts orchestrate the whole pipeline: build the app, start Metro, start Appium, run tests, tear everything down. Bypassing them means owning that lifecycle yourself.

---

## Entry Points

ALWAYS use the top-level bash scripts. Direct `ts-node tests/appium/runner.ts ...` invocation is for debugging the harness itself — not for normal test work.

```bash
./scripts/ui/run-e2e.sh           # interactive: pick test(s), then platform
./scripts/ui/run-android-e2e.sh   # android-only
./scripts/ui/run-ios-e2e.sh       # ios-only
```

The interactive script (`run-e2e.sh`) prompts for which tests to run (single test, `all`, or manual entry) and which platform.

---

## When Local Runs Get Stuck

Local e2e is sensitive to environment state — wedged simulators, stale Metro caches, port collisions, missing build artifacts, WDA session hangs. If the run script reports infrastructure errors before the test code starts, the fastest path forward is usually to push the branch and dispatch the test in CI.

Read `references/appium-running-ci.md`.

CI runs on a self-hosted macOS host with the full toolchain pre-warmed. The same test code, the same workflow — just on a fresh, dedicated environment.
