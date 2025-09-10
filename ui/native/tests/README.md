# E2E Testing

## Running E2E Tests

E2E tests are fully automated and integrated into the development environment. No manual setup required.

### Quick Start

1. Start the development environment:

    ```bash
    just run-dev-ui
    ```

2. In the mprocs dev UI that appears, select the **dev** pane and press **t** → **e** to launch the e2e test runner

3. Choose your tests:

    - **o** - onboarding test
    - **j** - JoinLeaveFederation test
    - **a** - all tests
    - **m** - manual selection

4. Choose platform:
    - **a** - Android
    - **i** - iOS
    - **b** - both platforms

The system will automatically:

-   Start/verify Appium server
-   Create fresh emulators/simulators (recommended)
-   Build and install the app
-   Clear app data for clean test runs
-   Execute the selected tests

### Test Management

**Available Tests:**

-   See `ui/native/tests/appium/` directory for all available tests
-   Use `all` to run the complete test suite

**Device Options:**

-   **Android**: Choose existing device or create fresh emulator (recommended)
-   **iOS**: Choose existing simulator or create fresh iOS 18 simulator (recommended)

⚠️ **Warning**: App data will be completely wiped from selected devices during testing.

### Development Tools

**Appium Inspector** (optional but recommended for test development):

-   Install [Appium Inspector](https://github.com/appium/appium-inspector)
-   Use the Recorder feature to generate test files for new functionality
-   When recording, ensure you're using [Element Mode](https://github.com/appium/appium-inspector/blob/main/docs/session-inspector/screenshot.md#interaction-mode) to select elements
-   Connect to the running Appium server (started automatically by the dev environment)

**Appium Server Logs** (optional):

-   The **appium** pane in mprocs allows you to manually start the Appium server and view logs in the foreground instead of running appium in the background
-   Select the **appium** pane and press 'y' to start the server with live log output
-   Useful for debugging test failures or connection issues

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
