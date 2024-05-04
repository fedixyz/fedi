fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios beta_ci

```sh
[bundle exec] fastlane ios beta_ci
```

Push a new beta build to TestFlight from CI

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Push a new beta build to TestFlight

### ios build

```sh
[bundle exec] fastlane ios build
```

Create a release build

### ios build_nightly

```sh
[bundle exec] fastlane ios build_nightly
```

Create a release build (Fedi Nightly)

### ios beta_ci_nightly

```sh
[bundle exec] fastlane ios beta_ci_nightly
```

Push a new beta build to TestFlight from CI (Fedi Nightly)

### ios beta_nightly

```sh
[bundle exec] fastlane ios beta_nightly
```

Push a new beta build to TestFlight (Fedi Nightly)

### ios check_appstore_certs

```sh
[bundle exec] fastlane ios check_appstore_certs
```

Check for signing certificates

### ios check_appstore_certs_nightly

```sh
[bundle exec] fastlane ios check_appstore_certs_nightly
```

Check for signing certificates (Fedi Nightly)

### ios renew_appstore_certs

```sh
[bundle exec] fastlane ios renew_appstore_certs
```

Generate renewed signing certificates

### ios renew_appstore_certs_nightly

```sh
[bundle exec] fastlane ios renew_appstore_certs_nightly
```

Generate renewed signing certificates (Fedi Nightly)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
