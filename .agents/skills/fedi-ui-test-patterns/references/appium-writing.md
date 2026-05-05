# Appium E2E Test Patterns

Patterns for writing or editing tests in `ui/native/tests/appium/common/`.

For running tests locally, see `references/appium-running-local.md`. For dispatching tests in CI, see `references/appium-running-ci.md`.

---

## Environment Summary

- **Tests**: `ui/native/tests/appium/common/<Name>.test.ts`
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
- single `execute()` method containing the full flow
- assertions are `throw new Error(...)` — never Jest matchers
- a `catch` method at the end for error logging (convention)
- `console.log` for progress; the file gets `/* eslint-disable no-console */`

Real example: `ui/native/tests/appium/common/onboarding.test.ts`

```typescript
/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class MyFeatureTest extends AppiumTestBase {
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

## App State Across Tests

There is no per-test fixture. Tests run sequentially in one Appium session, so app state carries between them.

- The `onboarding` test IS the onboarding flow. If it runs first, later tests start on the Home tab with Fedi Testnet joined.
- If a test fails, subsequent tests are skipped — the run stops.
- Plan ordering through the `availableTests` map in `runner.ts` and the CLI args.

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
- **Tests share state** — a failing test stops the run. Order in the `availableTests` map matters.
- **Some bottom-tab buttons trigger overlays, not navigation** — tapping `WalletTabButton` while already on the wallet tab opens the wallet switcher. Check `TabsNavigator.tsx` for `tabPress` listeners before assuming a tab tap is idempotent.
- **Screenshots are failure-only** — captured by the runner only on test failure. A passing run's artifact bundle contains no screenshots.
- **Locale leaks across sequential tests** — `clickOnText('Edit profile')` will break if a prior test left the app in Spanish. The onboarding test resets to `en` before finishing; new tests should preserve that or reset themselves.
- **Translated text is locale-dependent** — prefer `testID`s over `clickOnText` for English-only assertions.
