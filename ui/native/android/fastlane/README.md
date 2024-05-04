fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android test

```sh
[bundle exec] fastlane android test
```

Runs all the tests

### android build_debug

```sh
[bundle exec] fastlane android build_debug
```

Build a new apk to debug for production (apk can be found at /android/build/outputs/apk/production/debug/app-production-debug.apk)

### android build_production_apk

```sh
[bundle exec] fastlane android build_production_apk
```

Build a new app APK to release for production (apk can be found at /android/build/outputs/apk/production/release/app-production-release.apk)

### android build_production

```sh
[bundle exec] fastlane android build_production
```

Build a new app bundle to release for production

### android upload_internal_build

```sh
[bundle exec] fastlane android upload_internal_build
```

Upload the latest build to Play Store Console for internal testing

### android upload_beta_build_production

```sh
[bundle exec] fastlane android upload_beta_build_production
```

Upload the latest build to Play Store Console for beta testing

### android internal

```sh
[bundle exec] fastlane android internal
```

Submit a new internal build

### android beta

```sh
[bundle exec] fastlane android beta
```

Submit a new beta build

### android build_bitcoin_lake_apk

```sh
[bundle exec] fastlane android build_bitcoin_lake_apk
```

Build a new APK to release (Bitcoin Lake)

### android build_bitcoin_lake

```sh
[bundle exec] fastlane android build_bitcoin_lake
```

Build a new app bundle to release (Bitcoin Lake)

### android upload_internal_build_bitcoin_lake

```sh
[bundle exec] fastlane android upload_internal_build_bitcoin_lake
```

Upload the latest build to internal track (Bitcoin Lake)

### android internal_bitcoin_lake

```sh
[bundle exec] fastlane android internal_bitcoin_lake
```

Submit a new internal build (Bitcoin Lake)

### android upload_beta_build_bitcoin_lake

```sh
[bundle exec] fastlane android upload_beta_build_bitcoin_lake
```

Upload the latest build (Bitcoin Lake)

### android beta_bitcoin_lake

```sh
[bundle exec] fastlane android beta_bitcoin_lake
```

Submit a new beta build (Bitcoin Lake)

### android build_bitcoin_jungle_apk

```sh
[bundle exec] fastlane android build_bitcoin_jungle_apk
```

Build a new APK to release (Bitcoin Jungle)

### android build_bitcoin_jungle

```sh
[bundle exec] fastlane android build_bitcoin_jungle
```

Build a new app bundle to release (Bitcoin Jungle)

### android upload_internal_build_bitcoin_jungle

```sh
[bundle exec] fastlane android upload_internal_build_bitcoin_jungle
```

Upload the latest build to internal track (Bitcoin Jungle)

### android internal_bitcoin_jungle

```sh
[bundle exec] fastlane android internal_bitcoin_jungle
```

Submit a new internal build (Bitcoin Jungle)

### android upload_beta_build_bitcoin_jungle

```sh
[bundle exec] fastlane android upload_beta_build_bitcoin_jungle
```

Upload the latest build to beta track (Bitcoin Jungle)

### android beta_bitcoin_jungle

```sh
[bundle exec] fastlane android beta_bitcoin_jungle
```

Submit a new beta build (Bitcoin Jungle)

### android build_bitcoin_ekasi_apk

```sh
[bundle exec] fastlane android build_bitcoin_ekasi_apk
```

Build a new APK to release (Bitcoin Ekasi)

### android build_bitcoin_ekasi

```sh
[bundle exec] fastlane android build_bitcoin_ekasi
```

Build a new app bundle to release (Bitcoin Ekasi)

### android upload_internal_build_bitcoin_ekasi

```sh
[bundle exec] fastlane android upload_internal_build_bitcoin_ekasi
```

Upload the latest build to internal track (Bitcoin Ekasi)

### android internal_bitcoin_ekasi

```sh
[bundle exec] fastlane android internal_bitcoin_ekasi
```

Submit a new internal build (Bitcoin Ekasi)

### android upload_beta_build_bitcoin_ekasi

```sh
[bundle exec] fastlane android upload_beta_build_bitcoin_ekasi
```

Upload the latest build to beta track (Bitcoin Ekasi)

### android beta_bitcoin_ekasi

```sh
[bundle exec] fastlane android beta_bitcoin_ekasi
```

Submit a new beta build (Bitcoin Ekasi)

### android build_bravo_apk

```sh
[bundle exec] fastlane android build_bravo_apk
```

Build a new APK to release (Bravo)

### android build_bravo

```sh
[bundle exec] fastlane android build_bravo
```

Build a new app bundle to release (Bravo)

### android upload_internal_build_bravo

```sh
[bundle exec] fastlane android upload_internal_build_bravo
```

Upload the latest build to internal track (Bravo)

### android internal_bravo

```sh
[bundle exec] fastlane android internal_bravo
```

Submit a new internal build (Bravo)

### android build_nightly_apk

```sh
[bundle exec] fastlane android build_nightly_apk
```

Build a new APK to release (Nightly)

### android build_nightly

```sh
[bundle exec] fastlane android build_nightly
```

Build a new app bundle to release (Nightly)

### android upload_internal_build_nightly

```sh
[bundle exec] fastlane android upload_internal_build_nightly
```

Upload the latest build to internal track (Nightly)

### android internal_nightly

```sh
[bundle exec] fastlane android internal_nightly
```

Submit a new internal build (Nightly)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
