# Appium E2E Test Patterns

Reference for writing Appium black-box E2E tests in the Fedi codebase.

## File locations

- Test files: `ui/native/tests/appium/common/<TestName>.test.ts`
- Base class: `ui/native/tests/configs/appium/AppiumTestBase.ts`
- Runner: `ui/native/tests/appium/runner.ts`
- Manager: `ui/native/tests/configs/appium/AppiumManager.ts`
- Types: `ui/native/tests/configs/appium/types.ts`

## Test class pattern

Every Appium test is a class extending `AppiumTestBase` with an `execute()` method. No Jest -- assertions use `throw new Error(...)`.

```typescript
/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class MyFeatureTest extends AppiumTestBase {
    async execute(): Promise<void> {
        console.log('Starting My Feature Test')

        // Interact with the app
        await this.clickElementByKey('HomeTabButton')
        await this.waitForElementDisplayed('SomeElement')

        // Assert by throwing on failure
        if ((await this.elementIsDisplayed('ExpectedElement')) === false) {
            throw new Error('Expected element was not displayed')
        }
    }
    catch(error: unknown) {
        console.error('My feature test failed:', error)
    }
}
```

Key rules:
- Export the class (not default export)
- Import path is `'../../configs/appium/AppiumTestBase'` (from `common/` directory)
- `execute()` is the only method to implement -- it is abstract in the base class
- Add a `catch` method for error logging (convention in existing tests)
- Do NOT use Jest `expect()` -- throw `Error` objects for assertions
- Use `console.log` for progress logging (ESLint disable at top of file)

## Runner registration

To register a new test, edit `ui/native/tests/appium/runner.ts`:

```typescript
// 1. Add import
import { MyFeatureTest } from './common/MyFeature.test'

// 2. Add to availableTests map
const availableTests: Record<string, TestConstructor> = {
    onboarding: OnboardingTest,
    joinLeaveFederations: JoinLeaveFederation,
    myFeature: MyFeatureTest,  // <-- add here
}
```

The key in `availableTests` is the test name used on the command line.

## Test lifecycle

The runner does the following for each test:
1. `AppiumManager.setup()` -- creates or reuses an Appium WebDriver session
2. `test.initialize()` -- connects the test instance to the driver
3. `test.execute()` -- your test logic runs
4. On failure: takes a screenshot, dumps XML tree, then stops all tests

Tests run sequentially in the order specified. If one fails, subsequent tests are skipped.

## App state when execute() runs

There is NO `quickOnboard` or automatic setup. The `onboarding` test IS the onboarding flow. Tests run in sequence sharing the same app session, so:

- If `onboarding` runs first, subsequent tests start on the Home tab with the app onboarded and Fedi Testnet federation joined.
- If your test is the ONLY test, the app starts at the splash/onboarding screen.
- Plan test ordering carefully -- the `availableTests` map order and CLI args control sequence.

## Element interaction API

All methods are on `this` (inherited from `AppiumTestBase`). Default timeout is 20000ms.

### Finding and clicking elements by testID / accessibility ID

```typescript
// Click an element identified by testID or accessibility ID
await this.clickElementByKey('HomeTabButton')
await this.clickElementByKey('JoinFederationButton')

// Click with custom timeout (ms)
await this.clickElementByKey('SomeButton', 5000)

// Wait for element to be displayed (returns the element)
const el = await this.waitForElementDisplayed('UserQrContainer')
await this.waitForElementDisplayed('PlusButton', 5000)

// Check if element is displayed (returns boolean, does NOT throw)
const isVisible = await this.elementIsDisplayed('SomeElement')
const isVisible2 = await this.elementIsDisplayed('SomeElement', 2000)

// Find element without waiting/throwing (returns element or null)
const element = await this.findElementByKey('SomeKey')
```

### Finding and clicking elements by text

Use these when elements don't have a `testID` (e.g., settings menu items, translated strings, alert buttons).

```typescript
// Check if text is present on screen (returns boolean)
const found = await this.isTextPresent('some visible text')
const found2 = await this.isTextPresent('exact text', true)  // exact match
const found3 = await this.isTextPresent('text', false, 2000) // custom timeout

// Click on text (instanceNum = 0-based index of which match to click)
await this.clickOnText('Edit profile', 0)        // first instance
await this.clickOnText('Leave Federation', 0)
await this.clickOnText('Fedi Testnet', 0, true)   // exact match

// Wait for specific text to appear (throws if not found)
const el = await this.waitForText('some text', 0)           // first instance
const el2 = await this.waitForText('exact', 0, true, 5000)  // exact, 5s timeout

// Find elements by text (returns array, doesn't throw)
const elements = await this.findElementsByText('text')
const elements2 = await this.findElementsByText('text', true) // exact match

// Find single element by text (returns element or null)
const el3 = await this.findElementByText('text', 0)   // first instance
const el4 = await this.findElementByText('text', -1)   // last instance

// Count text instances
const count = await this.getTextInstanceCount('some text')
```

### Typing

```typescript
await this.clickElementByKey('DisplayNameInput')
await this.typeIntoElementByKey('DisplayNameInput', 'my new name')
```

### Scrolling

```typescript
// Scroll to find an element by testID (returns element or null)
const el = await this.scrollToElement('PersonalBackupButton')

// Scroll with options
await this.scrollToElement('SomeButton', {
    scrollDirection: 'up',       // 'up' | 'down' | 'left' | 'right'
    maxScrolls: 10,              // max scroll attempts (default: 10)
    scrollDuration: 100,         // ms per scroll gesture (default: 100)
    scrollPercentage: 10,        // 1-100, how far to scroll (default: 10)
})

// Scroll to find element by text
await this.scrollToText('Leave Federation')
await this.scrollToText('exact text', 1, true) // instanceNum=1, exactMatch=true

// Raw scroll (no element search)
await this.scroll('down', 100, 50)  // direction, duration(ms), percentage(1-100)
```

`scrollToElement` returns `null` if the element is not found after `maxScrolls` attempts. Use this for assertions:

```typescript
if ((await this.scrollToElement('SomeButton')) === null) {
    throw new Error('SomeButton not found after scrolling')
}

if ((await this.scrollToElement('ShouldNotExist')) !== null) {
    throw new Error('Element should not exist but was found')
}
```

### Alerts (native OS dialogs)

```typescript
// Accept (tap positive button)
await this.acceptAlert('OK')
await this.acceptAlert('Allow')
await this.acceptAlert('Yes')

// Dismiss (tap negative button)
await this.dismissAlert('No')
await this.dismissAlert('Cancel')
```

### Keyboard

```typescript
await this.dismissKeyboard()
```

### Clipboard

```typescript
const content = await this.getClipboard()
await this.setClipboard('some text to copy')
```

### Click-and-verify pattern

Repeatedly clicks an element until another element appears:

```typescript
await this.clickAndCheckForNextElement(
    'AvatarButton',        // element to click
    'HeaderCloseButton',   // element to wait for
    20000,                 // timeout (default: 20000)
    500,                   // retry delay (default: 500)
)
```

### Delays

Use raw `setTimeout` for timing-sensitive waits (no built-in sleep helper):

```typescript
await new Promise(resolve => setTimeout(resolve, 1000))
```

## How element finding works (platform differences)

`clickElementByKey(key)` and `findElementByKey(key)` try multiple locator strategies:

**Android:**
1. `accessibility id:{key}` -- matches `testID` prop or `accessibilityLabel`
2. `android=new UiSelector().resourceId("{key}")` -- matches resource ID

**iOS:**
1. `accessibility id:{key}` -- matches `testID` prop or `accessibilityLabel`
2. `id:{key}` -- matches element ID

The `key` parameter matches against React Native's `testID` prop. In React Native, `testID` is mapped to:
- Android: `contentDescription` (accessibility) and `resource-id`
- iOS: `accessibilityIdentifier`

For text-based finding (`findElementsByText`, `clickOnText`):

**Android:**
- `UiSelector().text("...")` or `textContains("...")`
- `UiSelector().description("...")` or `descriptionContains("...")`

**iOS:**
- `-ios predicate string:label == "..." OR name == "..." OR value == "..."`
- `-ios class chain:**/*[@label="..." or ...]`
- XPath fallback (slow)

## Common testIDs in the codebase

### Bottom tabs (from TabsNavigator.tsx)
- `HomeTabButton` -- Home tab
- `ChatTabButton` -- Chat tab
- `ModsTabButton` -- Mods/Mini Apps tab
- `FederationsTabButton` -- Federations tab

### Header buttons (from Header.tsx, MainHeaderButtons.tsx)
- `HeaderBackButton` -- back arrow in header
- `HeaderCloseButton` -- X close button in header
- `AvatarButton` -- user avatar (opens settings)
- `PlusButton` -- plus button (join federation)
- `ScanButton` -- QR scanner button
- `SearchButton` -- search button

### Onboarding / Federation joining
- `JoinFederationButton` -- confirm joining a federation
- `RecoverFromScratchSwitch` -- toggle for recovery mode
- `ContinueButton` -- continue button (permission gate, recovery words)
- `MaybeLaterButton` -- skip button on public federations
- `DisplayNameInput` -- text input for display name
- `DisplayNameLabel` -- label above display name input

### Dynamic federation testIDs (computed from federation name)
Federation names have spaces removed and a suffix appended:
- `{name}JoinButton` -- join button on public federations list (e.g., `FediTestnetJoinButton`, `E-CashClubJoinButton`, `BitcoinPrinciplesJoinButton`)
- `{name}DetailsButton` -- federation tile on Federations tab (e.g., `FediTestnetDetailsButton`, `E-CashClubDetailsButton`)
- `{name}FedAccordionButton` -- federation accordion in account settings (e.g., `FediGlobal(Nightly)CommAccordionButton`, `E-CashClubFedAccordionButton`)

### Dynamic mod testIDs (computed from mod title)
- `{title}VisibilityToggleButton` -- toggle visibility (e.g., `AskFediVisibilityToggleButton`, `BitrefillVisibilityToggleButton`)

### Chat
- `MessageInput-TextInput` -- chat message text input
- `MessageInput-SendButton` -- send message button

### Other
- `UserQrContainer` -- QR code container on settings screen
- `PasteButton` -- paste from clipboard
- `FederationInviteCloseButton` -- close federation invite
- `CommunityInviteCloseButton` -- close community invite

## Elements found by visible text (no testID)

Some UI elements don't have explicit `testID` props. They are found via their rendered text using `clickElementByKey` which falls back to accessibility ID matching against text content, or by using `clickOnText` / `isTextPresent`:

- `Get started` -- splash screen button
- `I accept` / `I do not accept` -- TOS acceptance buttons
- `Continue` -- various continue buttons
- `Save` -- save button (e.g., profile editing)
- `Edit profile` -- settings menu item
- `Language` / `Idioma` -- settings menu item (changes with locale)
- `Display currency` -- settings menu item
- `Personal Backup` -- settings menu item
- `Fedi Mini Apps` -- settings menu item
- `Community Mini Apps` -- federation settings menu item
- `Leave Federation` -- federation settings action
- Language codes: `en`, `es`, `ARS` (currency codes)

## Assertion patterns

Always assert by checking a condition and throwing an `Error`. Never use Jest matchers.

```typescript
// Element should be visible
if ((await this.elementIsDisplayed('ExpectedElement')) === false) {
    throw new Error('Expected element was not displayed')
}

// Element should NOT be visible
if ((await this.elementIsDisplayed('UnwantedElement')) === true) {
    throw new Error('Element should not be visible after action')
}

// Text should be present
if ((await this.isTextPresent('Expected text')) === false) {
    throw new Error('Expected text was not found on screen')
}

// Element should be found by scrolling
if ((await this.scrollToElement('ExpectedButton')) === null) {
    throw new Error('Expected button not found after scrolling')
}

// Element should NOT be found by scrolling
if ((await this.scrollToElement('RemovedElement')) !== null) {
    throw new Error('Element should have been removed but was still found')
}
```

## Run commands

Appium tests run via `ts-node` from the `ui/native` directory. An Appium server must be running on port 4723, and Metro bundler on port 8081.

```bash
# Set required environment variables first:
export PLATFORM=android  # or ios
export DEVICE_ID=emulator-5554  # Android: adb devices; iOS: xcrun simctl list
# OR for Android:
export AVD=Pixel_6_API_33

# Optional:
export BUNDLE_PATH=/path/to/app-debug.apk  # or .app/.ipa
export PLATFORM_VERSION=14.0
export APP_PACKAGE=com.fedi       # Android only, default: com.fedi
export BUNDLE_ID=org.fedi.alpha   # iOS only, default: org.fedi.alpha

# Run specific test(s):
cd ui/native
npx ts-node tests/appium/runner.ts onboarding
npx ts-node tests/appium/runner.ts joinLeaveFederations
npx ts-node tests/appium/runner.ts onboarding joinLeaveFederations

# Run all tests:
npx ts-node tests/appium/runner.ts all
```

## Complete test example

A realistic test that navigates to the Federations tab, joins a federation, verifies it appears, then leaves:

```typescript
/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class JoinAndLeaveFedTest extends AppiumTestBase {
    async execute(): Promise<void> {
        console.log('Starting Join and Leave Federation Test')

        // Navigate to federations tab
        await this.clickElementByKey('FederationsTabButton')
        await this.waitForElementDisplayed('PlusButton')

        // Join a public federation
        await this.clickElementByKey('PlusButton')
        await this.scrollToElement('E-CashClubJoinButton')
        await this.clickElementByKey('E-CashClubJoinButton')
        await this.waitForElementDisplayed('JoinFederationButton')
        await this.clickElementByKey('JoinFederationButton')

        // Verify federation was joined
        if ((await this.elementIsDisplayed('E-CashClubDetailsButton')) === false) {
            throw new Error('E-Cash Club not found after joining')
        }

        // Navigate to settings to leave
        await this.clickElementByKey('AvatarButton')
        await this.scrollToElement('E-CashClubFedAccordionButton')
        await this.clickElementByKey('E-CashClubFedAccordionButton')
        await this.scrollToElement('Leave Federation')
        await this.clickElementByKey('Leave Federation')

        // Dismiss the first "are you sure?" dialog
        await this.dismissAlert('No')

        // Try again and accept
        await this.scrollToElement('Leave Federation')
        await this.clickElementByKey('Leave Federation')
        await this.acceptAlert('Yes')

        // Verify federation was removed
        await this.clickElementByKey('HeaderCloseButton')
        await this.waitForElementDisplayed('PlusButton')
        if ((await this.scrollToElement('E-CashClubDetailsButton')) !== null) {
            throw new Error('E-Cash Club still present after leaving')
        }

        // Return to home
        await this.clickElementByKey('HomeTabButton')
    }
    catch(error: unknown) {
        console.error('Join and leave test failed:', error)
    }
}
```

## Gotchas

1. **No Jest** -- This is NOT a Jest test. No `describe`, `it`, `expect`, `beforeAll`, etc. Just a class with `execute()`.

2. **Shared session** -- All tests share one Appium session. If a test fails, subsequent tests are skipped. The app state carries over between tests.

3. **Timing** -- Some UI transitions need manual delays. Use `await new Promise(resolve => setTimeout(resolve, 1000))` when the UI needs time to settle (e.g., after animation, language change, navigation).

4. **Text vs testID** -- Many settings menu items and buttons are found by their visible text, not a `testID`. The `clickElementByKey` method uses `accessibility id:` which matches BOTH `testID` props and visible text on both platforms. If a button shows "Get started", you can use `clickElementByKey('Get started')`.

5. **Dynamic testIDs** -- Federation and mod testIDs are computed by concatenating the name (spaces removed) with a suffix. E.g., federation name "E-Cash Club" becomes `E-CashClub` prefix, so the join button is `E-CashClubJoinButton`.

6. **scrollToElement returns null** -- Unlike `waitForElementDisplayed` which throws, `scrollToElement` returns `null` if the element is not found. Use this for "element should not exist" assertions.

7. **elementIsDisplayed returns boolean** -- Unlike `waitForElementDisplayed` which throws, `elementIsDisplayed` returns `true`/`false`. Use this for conditional checks and assertions.

8. **Alert handling is platform-specific** -- `acceptAlert`/`dismissAlert` use different underlying APIs on Android vs iOS. The button label parameter should match the button text in the alert dialog.

9. **Metro bundle wait** -- The runner automatically waits up to 3 minutes for the Metro bundler to be ready before running tests. You don't need to handle this in test code.

10. **Screenshots on failure** -- The runner captures a screenshot and XML tree dump on test failure. Screenshots are saved to `ui/native/screenshots/`.
