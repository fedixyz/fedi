# Testing Environment

## Setup

To set up the testing environment, follow these steps:

1. Install Appium and webdriverio on your machine

```
npm install -g appium
yarn install // do this if you haven't installed webdriverio and deps already
```

At the present moment, it has to be installed globally and via npm because installation via yarn is not supported

2. Install the necessary drivers:

-   [UiAutomator2 for Android](https://appium.io/docs/en/latest/quickstart/uiauto2-driver/)
-   [XCUItest for iOS](https://github.com/appium/appium-xcuitest-driver)

3. (optionally) Install [Appium Inspector](https://github.com/appium/appium-inspector).

This tool may aid you in writing tests as it can generate ready-to-use test files for a given platform if you use the Recorder feature in Appium. Whenever you do that, take care to ensure that you're using the [Element Mode](https://github.com/appium/appium-inspector/blob/main/docs/session-inspector/screenshot.md#interaction-mode) to select the elements.

## Test types

Appium tests live in `appium`. Legacy Detox tests live in `detox` respectively, and may be removed in the future. Within these folders, the tests are devided into further subdirectories: `ios` and `android` for iOS and Android-specific tests respectively, as well as `common` for tests that work on both platforms.

The test are further subdivided into `standard` and `adhoc` tests.

-   `adhoc` tests are tests that have been recorded via Appium Inspector and have not been modified further.
-   `standard` tests are tests that meet the standards defined below.

We should aim to have most of our tests to be `common` and `standard`.

## Running the tests

At the moment, to run the tests, you need a freshly installed Fedi app on your device/e(si)mulator w/ no user data.

-   `adhoc` and `standard` tests can be run via `node your.test.js`
-   `standard` tests can be run via either:

```bash
just run-dev-ui interactive
...
Build for Android? (y/n) y  # will allow for running Android tests
Build for iOS (y/n) y  # will allow for running iOS tests
Run e2e tests (WARNING: app data will be erased) (y/n) y  # will actually trigger running the tests and present you with a list of runnable tests. Test will only run on platforms you've selected previously
Input the name of tests you wish to run separated by spaces, or input 'all' to run all tests and press Enter:  # will default to 'all' if no valid test names were entered
```

OR:

```bash
nix develop .#xcode --command env -u MACOSX_DEPLOYMENT_TARGET ./scripts/ui/start-appium.sh # use this command macOS. The rest should just run ./scripts/ui/start-appium.sh
# in a separate nix shell
cd ui
PLATFORM=ios|android DEVICE_ID=simulatorUDID|androidSerial yarn run ts-node ./native/tests/appium/runner.ts all|onboarding
```

This method will also check if you have set up Appium and its drivers correctly.

## Test standards

-   Tests must test for specific product requirements, which can be found in internal Product Requirement Docs.
-   Elements within tests must contain product requirement IDs to which they are related, e.g.

```
const ON2ContinueButton = await driver.$("accessibility id:Continue");
await ON2ContinueButton.click();
```

-   The driver must be able to find elements by either `id`, `accessibility id`, or some other unique attribute that will not vary between different testing devices such as various `instance(n)`. Counter-example:

```
const el2 = await driver.$("-android uiautomator:new UiSelector().className(\"android.view.View\").instance(1)");
```

-   Tests must work on all supported screen and font sizes.
-   For common tests, the `id` for an element needs to be the same on both platforms.
