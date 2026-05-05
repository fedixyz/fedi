# Running Appium E2E Tests In CI

How to push to a branch and dispatch the e2e workflow on it.

For writing tests, see `references/appium-writing.md`. For running locally, see `references/appium-running-local.md`.

---

## When To Use CI

Two cases:

1. **Canonical pre-merge validation.** The Android and iOS suites are slow and require self-hosted runners. CI is the place to confirm a test passes before opening a PR.
2. **Fallback when local is wedged.** If the local run is stuck on environment issues (simulator state, harness setup, port collisions), CI runs the same tests on a fresh, pre-warmed host. Push the branch and dispatch — don't burn hours fighting local infra.

---

## Dispatching A Run

The workflow is `.github/workflows/e2e-tests.yml`. Read the `workflow_dispatch.inputs` block there for the canonical list of inputs and their descriptions. Single-platform runs (`platforms=ios` or `platforms=android`) are noticeably faster than `all`.

**Gotcha not in the YAML:** `skip_bridge_build` reuses cached artifacts from a prior run on the same host. Do NOT enable it on the first dispatch from a branch — stale artifacts can break the build (notably iOS xcodebuild) before tests run. Only enable after a clean run on the same branch has primed the cache.

```bash
git push origin <branch>
gh workflow run e2e-tests.yml --ref <branch> -f platforms=android -f tests=all
gh run list --workflow=e2e-tests.yml -L 3 --json databaseId,status,headBranch
gh run watch <run-id> --exit-status   # blocks; non-zero exit on failure
```

---

## Reading A Failed Run

A red run conclusion does NOT mean your test failed. Any single test failure fails the whole run, so first check the `=== Test Run Summary ===` block in the pipeline log to see which test(s) actually failed.

Each platform job uploads an artifact (`android-logs` or `ios-logs`) on `always()` — present whether the run passed or failed.

```bash
gh run download <run-id> -n android-logs -D /tmp/e2e-debug
```

Inside the bundle:

- `ui/.appium/appium-attempt-1.log` — full WebDriver proxy traffic between the test and the platform driver. Search for `404`, `NoSuchElementError`, or `mobile: alert` to find the failing command.
- `ui/.appium/pipeline/*.log` — per-stage output (bridge, Metro, emulators, build, Appium startup). Useful when failure happens before tests start.
- `ui/screenshots/*.png` — captured ONLY on test failure, named `<testName>-failure-<timestamp>.png`. The runner also dumps the page source alongside.
- `metro.log` — JS bundling errors.

For the high-level "which test failed and why," `gh run view --job=<job-id> --log` is faster than the full artifact. Pull the artifact when you need the WebDriver transaction trace or the failure screenshot.

---

## Picking A Job ID

The run page shows separate jobs per platform. To list them:

```bash
gh run view <run-id>
```

Each job has its own ID. Use it for `gh run view --job=<job-id> --log` to scope output to one platform.
