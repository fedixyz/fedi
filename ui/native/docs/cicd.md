# Overview

This document outlines the continuous integration & deployment pipeline for the Fedi mobile app.

[Fastlane](https://docs.fastlane.tools) is used to configure & run deployment jobs

Github Actions workflows are used with Buildjet runners. However, the deployment workflow for iOS can only be run on `macos` runners which Buildjet does not provide.

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

This workflow runs on every PR opened to the `develop` or `release/**` branches and checks for:

- Code formatting issues via Prettier
- Code linting issues via ESLint (uses typescript-parser)
- Typescript errors

Developers should be sure their PRs pass these checks before requesting a review.

- [Run test suites](https://github.com/fedibtc/fedi/actions/workflows/test.yml)

# Deployments

## Generate an APK

This core workflow runs on every `push` event to a `release/**` branch and configures all dependencies to build a fresh version of the bridge, assembles an APK, and publishes it as a Github draft release where the APK can be downloaded and installed. Versioning is also handled automatically (see [Versioning](#versioning) below)

- [Publish APK to GitHub](https://github.com/fedibtc/fedi/actions/workflows/publish-android-apk.yml)

## Special Deployments

These workflows have all the same build steps as the APK workflow but fastlane is set up to generate the respective "flavor" for special deployments which produces an APK with a unique app ID. These workflows should not increment the version number... but may increment the versionCode if necessary (see [Versioning](#versioning))

- [Publish APK (Bitcoin Lake) to GitHub](https://github.com/fedibtc/fedi/actions/workflows/publish-android-apk-bitcoin-lake.yml)
- [Publish APK (Bitcoin Ekasi) to GitHub](https://github.com/fedibtc/fedi/actions/workflows/publish-android-apk-bitcoin-ekasi.yml)

## Play Store

This workflow also has all the same build steps as the APK workflow but assembles an AAB instead of an APK so it can be automatically uploaded to the Play Store via [fastlane](https://docs.fastlane.tools/getting-started/android/beta-deployment/). See the [Authentication](#authentication) section below to make sure the credentials are configured properly.

- [Deploy to Google Play - Internal Testing](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-gp-internal-testing.yml)
- [Deploy (Bitcoin Ekasi) to Google Play - Internal Testing](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-gp-internal-bitcoin-ekasi.yml)
- [Deploy (Bitcoin Lake) to Google Play - Internal Testing](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-gp-internal-bitcoin-lake.yml)

## TestFlight

This workflow builds the bridge for iOS so is similar to the above APK workflow but without the Android-specific steps.

- [Deploy to TestFlight](https://github.com/fedibtc/fedi/actions/workflows/deploy-to-testflight.yml)

❗❗❗
This currently takes an extremely long time (1hr+) since the `macos` runner is slow to build the bridge and it's also more expensive relative to Linux.

Be sure to check the version number + build number on the [Builds page](https://appstoreconnect.apple.com/apps/6444390789/testflight/ios) in App Store Connect and check Xcode to make sure both numbers are higher than whatever you see there, otherwise the workflow will fail at the very last step.
❗❗❗

## Planned/WIP

- [ ] Deploy to Google Play - Beta Testing
- [ ] Deploy (Bitcoin Ekasi) to Google Play - Beta Testing
- [ ] Deploy (Bitcoin Lake) to Google Play - Beta Testing

# Caching

Several build steps use Github Actions native caching to avoid recompiling things like Rust, JDK, & NPM dependencies. However there is a [known issue](https://github.com/actions/cache/issues/720#issuecomment-1125201306) where downloading cached files sometimes takes a very long time and stalls out due to potential bandwidth issues with self-hosted runners. Cancelling and re-running the workflow usually resolves this.

# Versioning

The CICD system has built-in versioning that uses `npm version` and `react-native-version` to increment version numbers and commit changes directly to the branch running the workflow.

In the default case, each run of the publish-android-apk workflow will perform a *patch version bump* and update package.json (1.0.0 => 1.0.1) accordingly. `react-native-version` will then also update both the iOS + Android files with that version to keep them in sync.

If uploading builds to app stores, the versionCode (Android) and build number (iOS) will need to be auto-incremented if the version number stays the same. In most cases, this shouldn't be a problem since CICD always increments the version number.

For major or minor version bumps, simply create a release branch with the new version and the workflow will automatically start bumping with the new version from the branch name. For example:

- A workflow running `v1.0.0` from `release/1.0` branch will bump the version to `v1.0.1`
- A workflow running `v1.0.0` from `release/2.0` branch will bump the version to `v2.0.0`
- A workflow running `v2.0.0` from `release/2.0` branch will bump the version to `v2.0.1`
- A workflow running `v2.0.0` from `release/2.1` branch will bump the version to `v2.1.0`

# Authentication

## Android

The JSON file containing the credentials to upload the app bundle to Play Store is injected via Github Actions secrets and decoded at build time.

To configure this, obtain the JSON file by following the steps in the **Collect your Google credentials** section here: <https://docs.fastlane.tools/getting-started/android/setup/>

Then base64-encode the JSON file `base64 -i ./path/to/service-account.json > ./service-account-encoded.txt` and copy-paste this string in the TXT file as the value of the `PLAY_STORE_JSON_CREDENTIALS_ENCODED` Github Actions Secret.

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

Then base64-encode the JSON file `base64 -i ./path/to/asc-api-key.json > ./asc-api-key-encoded.txt` and copy-paste this string in the TXT file as the value of the `ASC_API_KEY_JSON_CREDENTIALS_ENCODED` Github Actions Secret.

The deployment workflow will then decode the JSON file at build time.

For iOS signing, a keychain stored on the CI runner is used. The keychain password is provided at build time via Github Actions and not stored on the runner. The keychain password must be provided as the environment variable MATCH_PASSWORD for the fastlane action to succeed.

# Building Locally

If GitHub Actions is not available, fastlane can be used to generate builds locally.

## Android

See [android/fastlane/README.md](https://github.com/fedibtc/fedi/blob/master/android/fastlane/README.md) for available fastlane commands

## iOS

Follow this setup guide to deploy iOS builds: <https://docs.fastlane.tools/getting-started/ios/setup/>

### Authenticate with Apple ID

Run

```bash
cp ./ios/fastlane/.env.example ./ios/fastlane/.env
```

Then replace `FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD` with your own [application-specific password](https://support.apple.com/en-us/HT204397)

See the [`.env.example`](https://github.com/fedibtc/fedi/blob/master/ios/fastlane/.env.example)

See [ios/fastlane/README.md](https://github.com/fedibtc/fedi/blob/master/ios/fastlane/README.md) for available fastlane commands

<https://docs.fastlane.tools/getting-started/ios/authentication/>

### Publish builds to TestFlight

<https://docs.fastlane.tools/getting-started/ios/beta-deployment/>
