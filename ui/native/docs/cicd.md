# Overview

This document outlines the continuous integration & deployment pipeline for the Fedi mobile app.

[Fastlane](https://docs.fastlane.tools) is used to configure & run deployment jobs

GitHub Actions workflows build and deploy the native app with Nix and Fastlane. Android jobs run on self-hosted Linux runners; TestFlight jobs run on self-hosted macOS ARM64 deployment runners.

- [Overview](#overview)
- [Running Tests](#running-tests)
- [Deployments](#deployments)
  - [Generate an APK](#generate-an-apk)
  - [Special Deployments](#special-deployments)
  - [Play Store](#play-store)
  - [TestFlight](#testflight)
  - [Planned/WIP](#plannedwip)
- [Caching](#caching)
- [Versioning](#versioning)
- [Authentication](#authentication)
  - [Android](#android)
  - [iOS](#ios)
- [Building Locally](#building-locally)
  - [Android](#android-1)
  - [iOS](#ios-1)
    - [Authenticate with Apple ID](#authenticate-with-apple-id)
    - [Publish builds to TestFlight](#publish-builds-to-testflight)

---------------

# Running Tests

The UI checks workflow runs on pull requests and checks for:

- Code formatting issues via Prettier
- Code linting issues via ESLint (uses typescript-parser)
- Typescript errors
- Unit and integration test failures
- Metro startup failures

Developers should be sure their PRs pass these checks before requesting a review.

- [UI Checks](https://github.com/fedibtc/fedi/actions/workflows/test-ui.yml)

The end-to-end workflow runs scheduled and manual e2e coverage across native and web:

- [End-to-end tests](https://github.com/fedibtc/fedi/actions/workflows/e2e-tests.yml) accepts `platforms=all`, `android`, `ios`, or `web`.
- Android and iOS jobs run the Appium pipeline through `scripts/ci/e2e-pipeline.sh` on self-hosted macOS GUI runners.
- The web job runs `scripts/ui/run-e2e-web.sh` on a self-hosted Linux runner, starts the built web app with nightly environment variables, and uploads Playwright results from `ui/web/test-results/`.

# Deployments

## Generate an APK

The manual APK workflows configure dependencies, build the bridge, assemble an APK, verify that the APK embeds the expected bridge commit hash, and publish the artifact to GitHub.

- [Upload APK to GitHub](https://github.com/fedibtc/fedi/actions/workflows/upload-android-apk.yml) creates a draft GitHub release with a production APK.
- [Deploy Public APK](https://github.com/fedibtc/fedi/actions/workflows/deploy-public-apk-to-github.yml) builds the public APK path used by the Vercel public APK deployment script.

## Special Deployments

These workflows have the same core Android build path as the production release workflow, but set `FEDI_ENV` and the Android flavor for non-production channels:

- [Release Fedi Nightly](https://github.com/fedibtc/fedi/actions/workflows/release-nightly.yml) builds the nightly APK, creates a draft GitHub release, and then calls the nightly Google Play and TestFlight deployment workflows when run from `master` or `release/**`.
- [Release Fedi Nova](https://github.com/fedibtc/fedi/actions/workflows/release-nova.yml) builds the Nova APK, creates a draft GitHub release, and then calls the Nova Google Play and TestFlight deployment workflows.

## Play Store

This workflow also has all the same build steps as the APK workflow but assembles an AAB instead of an APK so it can be automatically uploaded to the Play Store via [fastlane](https://docs.fastlane.tools/getting-started/android/beta-deployment/). See the [Authentication](#authentication) section below to make sure the credentials are configured properly.

- [Deploy to Google Play - Internal Testing](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-gp-internal-testing.yml)
- [Deploy to Google Play - Internal Testing (Fedi Nightly)](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-gp-internal-testing-nightly.yml)
- [Deploy to Google Play - Internal Testing (Fedi Nova)](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-gp-internal-testing-nova.yml)

## TestFlight

This workflow builds the bridge for iOS so is similar to the above APK workflow but without the Android-specific steps.

- [Deploy to TestFlight](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-testflight.yml)
- [Deploy to TestFlight (Fedi Nightly)](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-testflight-nightly.yml)
- [Deploy to TestFlight (Fedi Nova)](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-testflight-nova.yml)

❗❗❗
This currently takes an extremely long time (1hr+) since the `macos` runner is slow to build the bridge and it's also more expensive relative to Linux.

Be sure to check the version number + build number on the [Builds page](https://appstoreconnect.apple.com/apps/6444390789/testflight/ios) in App Store Connect and check Xcode to make sure both numbers are higher than whatever you see there, otherwise the workflow will fail at the very last step.
❗❗❗

## Planned/WIP

- [ ] Deploy to Google Play - Beta Testing

# Caching

Several build steps use GitHub Actions native caching to avoid recompiling things like Rust, JDK, & NPM dependencies. However there is a [known issue](https://github.com/actions/cache/issues/720#issuecomment-1125201306) where downloading cached files sometimes takes a very long time and stalls out due to potential bandwidth issues with self-hosted runners. Cancelling and re-running the workflow usually resolves this.

# Versioning

Version bumps are handled by [Bump version - Native UI](https://github.com/fedibtc/fedi/actions/workflows/bump-version-native-ui.yml), which runs `scripts/ui/bump-version-native.sh` manually on `release/**` or `backport/**` branches.

On `release/**`, the script compares the branch version with `ui/native/package.json`. If the branch minor version differs, it sets the package version to `<branch>.0`; otherwise it performs a patch bump. On `backport/**`, it sets the package version to the branch suffix. The script then updates Android with `react-native-version`, updates iOS marketing versions with `agvtool`, commits the native version files, pushes the branch, and creates a version bump pull request.

The release and upload workflows do not bump versions themselves. They read the current `ui/native/package.json` version when naming draft releases and APK outputs.

For major or minor version bumps, simply create a release branch with the new version and the workflow will automatically start bumping with the new version from the branch name. For example:

- A workflow running `v1.0.0` from `release/1.0` branch will bump the version to `v1.0.1`
- A workflow running `v1.0.0` from `release/2.0` branch will bump the version to `v2.0.0`
- A workflow running `v2.0.0` from `release/2.0` branch will bump the version to `v2.0.1`
- A workflow running `v2.0.0` from `release/2.1` branch will bump the version to `v2.1.0`

# Authentication

## Android

The JSON file containing the credentials to upload the app bundle to Play Store is injected via GitHub Actions secrets and decoded at build time.

To configure this, obtain the JSON file by following the steps in the **Collect your Google credentials** section here: <https://docs.fastlane.tools/getting-started/android/setup/>

Then base64-encode the JSON file `base64 -i ./path/to/service-account.json > ./service-account-encoded.txt` and copy-paste this string in the TXT file as the value of the `PLAY_STORE_JSON_CREDENTIALS_ENCODED` GitHub Actions Secret.

The deployment workflow will then decode the JSON file at build time.

The release keystore needed by Gradle to sign the APK also uses the same process to encode + decode the keystore & the credentials file:

ANDROID_KEYSTORE_FILE_ENCODED: `base64 -i ./path/to/fedi-android-production.keystore > ./android-keystore-file.txt`
ANDROID_KEYSTORE_PROPERTIES_ENCODED: `base64 -i ./path/to/keystore.properties > ./android-keystore-properties.txt`

## iOS

iOS authentication uses an App Store Connect API key.

To configure this, first obtain a `.p8` file by following the steps in the **Creating an App Store Connect API Key** section here: <https://docs.fastlane.tools/app-store-connect-api/>

The `App Manager` role should be sufficient for deployments.

Then prepare a new JSON file (`asc-api-key.json`) as instructed further down in the **Using fastlane API Key JSON file** section.

The `issuer_id` and `key_id` values are obtained from the App Store Connect dashboard where you created the API key and the `key` value is the raw string from the `.p8` file.

Then base64-encode the JSON file `base64 -i ./path/to/asc-api-key.json > ./asc-api-key-encoded.txt` and copy-paste this string in the TXT file as the value of the `ASC_API_KEY_JSON_CREDENTIALS_ENCODED` GitHub Actions Secret.

The deployment workflow will then decode the JSON file at build time.

For iOS signing, a keychain stored on the CI runner is used. The keychain password is provided at build time via GitHub Actions and not stored on the runner. The keychain password must be provided as the environment variable MATCH_PASSWORD for the fastlane action to succeed.

# Building Locally

If GitHub Actions is not available, fastlane can be used to generate builds locally.

## Android

See [android/fastlane/README.md](../android/fastlane/README.md) for available fastlane commands

## iOS

Follow this setup guide to deploy iOS builds: <https://docs.fastlane.tools/getting-started/ios/setup/>

### Authenticate for Signing and App Store Connect

The current iOS deployment path uses App Store Connect API credentials and Fastlane Match credentials provided through environment variables. See [deploy-to-testflight.yml](../../../.github/workflows/deploy-to-testflight.yml), [make-testflight-creds.sh](../../../scripts/ci/make-testflight-creds.sh), and [deploy-to-testflight.sh](../../../scripts/ui/deploy-to-testflight.sh) for the exact local inputs and build steps.

See [ios/fastlane/README.md](../ios/fastlane/README.md) for available fastlane commands.

<https://docs.fastlane.tools/getting-started/ios/authentication/>

### Publish builds to TestFlight

<https://docs.fastlane.tools/getting-started/ios/beta-deployment/>
