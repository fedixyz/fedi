# Appium E2E Test Patterns

Patterns for writing or editing tests in `ui/native/tests/appium/common/`.

For running tests locally, see `references/appium-running-local.md`. For dispatching tests in CI, see `references/appium-running-ci.md`.

---

## Environment Summary

- **Tests**: `ui/native/tests/appium/common/<Name>.test.ts`
- **Fixtures**: `ui/native/tests/appium/fixtures/<setup>.ts`
- **Runner**: `ui/native/tests/appium/runner.ts`
- **Base class**: `ui/native/tests/configs/appium/AppiumTestBase.ts`
- **Driver setup**: `ui/native/tests/configs/appium/AppiumManager.ts`
- **CI workflow**: `.github/workflows/e2e-tests.yml`

E2E tests are class-based. They do NOT use Jest — no `describe`, `it`, `expect`, `beforeAll`. Each test is a class extending `AppiumTestBase` with a single `execute()` method that fails by throwing.

Read the existing tests in `ui/native/tests/appium/common/` before writing or editing — they are the source of truth for current testIDs and flow ordering.

---

## Test Class Shape

Default shape:

- named export of a class extending `AppiumTestBase`
- optional `static prerequisites` declaring required states (default `[]` = fresh install)
- optional `static produces` declaring the states the device satisfies after a successful run (default `[]`). Required if the test leaves the device in a state a subsequent test could rely on, otherwise the ledger lies and the next test re-runs setup against a non-fresh app
- single `execute()` method containing the full flow
- assertions are `throw new Error(...)` — never Jest matchers
- a `catch` method at the end for error logging (convention)
- `console.log` for progress; the file gets `/* eslint-disable no-console */`

Real example: `ui/native/tests/appium/common/onboarding.test.ts`

```typescript
/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class MyFeatureTest extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    static produces = ['onboarded'] as const

    async execute(): Promise<void> {
        await this.clickElementByKey('HomeTabButton')
        await this.waitForElementDisplayed('SomeElement')
        if ((await this.elementIsDisplayed('Expected')) === false) {
            throw new Error('Expected element was not displayed')
        }
    }
    catch(error: unknown) {
        console.error('My feature test failed:', error)
    }
}
```

---

## State, Prerequisites, And Fixtures

Each test gets a fresh app install by default. If a test needs a non-fresh starting state (onboarded user, joined federation, populated chat room), it declares the required states via `static prerequisites` and the runner gets the device there before `execute()` runs.

### How the runner satisfies prerequisites

The runner keeps a `currentState` ledger of which states the device currently satisfies. Before each test:

1. If the ledger has states **beyond** what the test needs, the runner calls `resetAppToFresh()` and clears the ledger.
2. The runner then runs only the fixtures whose `produces` state is in `prerequisites` but not in the ledger, in topo-sorted order so transitive `requires` are satisfied first.
3. Each fixture, on success, adds its `produces` state to the ledger.

This means **adjacent tests with the same prerequisites pay the fixture cost once**, not once per test. It also means **test order is a performance hint, not a correctness contract** — the runner is correct in any order.

### What happens on failure

A failing test no longer stops the run. The runner captures a screenshot, calls `resetAppToFresh()`, clears the ledger, and continues with the next test. The run still exits non-zero if any test failed, but every test gets a chance to run.

### Writing a fixture

Fixtures live in `ui/native/tests/appium/fixtures/`. A fixture is an object with `produces` (the state it generates), `requires` (other states that must already hold), and an async `run` that drives the UI:

```typescript
// ui/native/tests/appium/fixtures/setupOnboarded.ts
import { Fixture } from './types'

export const setupOnboarded: Fixture = {
    produces: 'onboarded',
    requires: [],
    async run(t) {
        await new Promise(r => setTimeout(r, 10000))
        await t.clickElementByKey('Get started')
        await t.clickElementByKey('ManualSetupButton')
        await t.scrollToElement('FediTestnetJoinButton')
        await t.clickElementByKey('FediTestnetJoinButton')
        await t.clickElementByKey('JoinFederationButton')
        await t.clickElementByKey('HomeTabButton')
    },
}
```

Then register it in `runner.ts`'s `fixtures` map. The runner picks it up automatically — no other plumbing needed.

A fixture should be **idempotent in its post-condition, not its execution**: it always runs from a fresh app and always leaves the device in the same observable state. Don't try to detect "already onboarded and short-circuit" — the runner guarantees the app is fresh when `run` is called.

### Mid-test reset

`this.resetAppToFresh()` is also available inside `execute()` for tests that need to wipe state mid-flow (e.g. onboard, capture seed, reset, recover with the captured seed). The Appium session survives — `this.driver` keeps working, JS variables in scope keep their values.

### Adding a new prerequisite state

To create a new state (e.g. `'joinedTestnet'`):

1. Add `ui/native/tests/appium/fixtures/setupJoinedTestnet.ts` with `produces: 'joinedTestnet'` and `requires: ['onboarded']`.
2. Register it in `fixtures` in `runner.ts`.
3. Tests that need it declare `static prerequisites = ['joinedTestnet']`. The resolver chains `setupOnboarded` → `setupJoinedTestnet` automatically.

---

## Element Interaction API

All methods are on `this`. Default timeout is 20000ms. Read `AppiumTestBase.ts` for the full surface; the snippets below are the high-frequency patterns.

### By testID / accessibility ID

```typescript
await this.clickElementByKey('HomeTabButton')               // throws on timeout
await this.waitForElementDisplayed('UserQrContainer')        // returns element
const visible = await this.elementIsDisplayed('Foo')         // returns boolean
const visible2 = await this.elementIsDisplayed('Foo', 2000)  // custom timeout
```

`key` matches React Native's `testID` (mapped to accessibility ID on both platforms). On Android it also falls back to `resourceId`; on iOS to native element `id`.

### By visible text

Use when an element has no `testID` (translated menu items, alert button labels):

```typescript
await this.clickOnText('Edit profile', 0)         // first match, partial
await this.clickOnText('Fedi Testnet', 0, true)   // exact match
const found = await this.isTextPresent('Some text')
```

### Scrolling

```typescript
await this.scrollToElement('PersonalBackupButton')           // returns element|null
await this.scrollToElement('Foo', { scrollDirection: 'up' })
await this.scrollToText('Leave Federation')
```

`scrollToElement` returns `null` (rather than throwing) if not found — that's the idiom for "should NOT be present" assertions:

```typescript
if ((await this.scrollToElement('LeftFederation')) !== null) {
    throw new Error('Federation still present after leaving')
}
```

### Typing

```typescript
await this.clickElementByKey('DisplayNameInput')
await this.typeIntoElementByKey('DisplayNameInput', 'new name')
await this.dismissKeyboard()
```

### Alerts

```typescript
await this.acceptAlert('OK')        // tap positive button
await this.dismissAlert('No')       // tap negative button
```

These wrap a 3-step fallback chain on Android: native system alert with button label, then native system alert without label, then `clickOnText(label.toUpperCase(), 0, true)` for in-app RN `Alert.alert()` dialogs (which Appium does NOT see as system alerts). Pass the human-readable button label and let the chain figure out the rest.

### Manual delays

There is no built-in `sleep` helper — use `setTimeout` directly when you need to wait for an animation or async settle:

```typescript
await new Promise(r => setTimeout(r, 1000))
```

---

## Dynamic TestIDs

Don't memorize a list of testIDs — they change as the app evolves. Read the existing two test files for current ones in use, and grep for `testID=` in `ui/native/screens` and `ui/native/components` when you need a new one.

Two patterns are worth knowing because they don't live in any single file:

### Federation / community / mod testIDs

Built from the entity name with spaces stripped. Other punctuation (parens, hyphens) is preserved.

- `{Name}JoinButton` — join button on the public federations list (e.g. `E-CashClubJoinButton`)
- `{Name}DetailsButton` — federation tile on the wallet tab
- `{Name}FedAccordionButton` — federation accordion in settings
- `{Name}CommAccordionButton` — community accordion in settings (e.g. `FediGlobal(Nightly)CommAccordionButton`)
- `{Title}VisibilityToggleButton` — mod visibility toggle (e.g. `AskFediVisibilityToggleButton`)

---

## Registering A New Test

Three places must be updated together. Forgetting any one silently drops the test from one of the entry points.

1. `ui/native/tests/appium/runner.ts` — import the class, add it to `availableTests`. The map key is the CLI-facing name.
2. `.github/workflows/e2e-tests.yml` — add the new name to `inputs.tests.options`. The workflow_dispatch dropdown is an explicit allowlist.
3. `scripts/ui/run-e2e.sh` — add to the `available_tests` array and the interactive menu.

---

## Conventions And Gotchas

- **No Jest** — class with `execute()`, throw on failure. Don't import Jest matchers.
- **Default to fresh install** — a test that doesn't declare `static prerequisites` runs against a freshly reset app. Don't write tests that quietly assume what a prior test left behind; declare the prerequisite or do the setup yourself.
- **Fixtures don't short-circuit** — when the runner calls a fixture's `run`, the app is always fresh. Don't add "already in state X" detection logic to fixtures.
- **Some bottom-tab buttons trigger overlays, not navigation** — tapping `WalletTabButton` while already on the wallet tab opens the wallet switcher. Check `TabsNavigator.tsx` for `tabPress` listeners before assuming a tab tap is idempotent.
- **Screenshots are failure-only** — captured by the runner only on test failure. A passing run's artifact bundle contains no screenshots.
- **Locale changes need to be reverted within the test** — if a test changes language to Spanish, switch back to `en` before finishing. The runner's reset handles this between tests, but a test that assumes English mid-flow will break itself if it doesn't reset.
- **Translated text is locale-dependent** — prefer `testID`s over `clickOnText` for English-only assertions.
