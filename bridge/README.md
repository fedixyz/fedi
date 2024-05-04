# Fedi README

## Prerequisites

[Install Rust](https://www.rust-lang.org/tools/install)

## Building

`/scripts/bridge/build-bridge-android.sh` will build the Android package and publish to "maven local". `/scripts/bridge/build-bridge-ios.sh` build build the ios package which you can add to project via XCode UI.

Export the following variables to get Android builds working. Ask a project maintainer if you have any trouble building for Android.

```shell
export ANDROID_NDK_ROOT=/Users/justin/Library/Android/sdk/ndk/25.1.8937393
export PATH="$PATH:/Users/justin/Library/Android/sdk/ndk/25.1.8937393/toolchains/llvm/prebuilt/darwin-x86_64/bin"
export AR=/opt/homebrew/opt/llvm/bin/llvm-ar
./scripts/bridge/build-bridge-android.sh
```

## [Debugging](./debugging.md)

## Troubleshooting

1. If you see `ld: error: unable to find library -lgcc` error, create these 4 files:

```
~/Library/Android/sdk/ndk/<version>/toolchains/llvm/prebuilt/darwin-x86_64/lib64/clang/14.0.6/lib/linux/i386/libgcc.a
~/Library/Android/sdk/ndk/<version>/toolchains/llvm/prebuilt/darwin-x86_64/lib64/clang/14.0.6/lib/linux/arm/libgcc.a
~/Library/Android/sdk/ndk/<version>/toolchains/llvm/prebuilt/darwin-x86_64/lib64/clang/14.0.6/lib/linux/aarch64/libgcc.a
~/Library/Android/sdk/ndk/<version>/toolchains/llvm/prebuilt/darwin-x86_64/lib64/clang/14.0.6/lib/linux/x86_64/libgcc.a
```

Inside them just put the following:

```
INPUT(-lunwind)
```

2. If you see `error occurred: Failed to find tool. Is `arm-linux-androideabi-clang++` installed?`, run these commands to copy the clang files into the appropriate architecture directory:

```
cp $ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin/armv7a-linux-androideabi21-clang $ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin/arm-linux-androideabi-clang
cp  $ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin/armv7a-linux-androideabi21-clang++ $ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/darwin-x86_64/bin/arm-linux-androideabi-clang++
```

## Testing

Run `fedimint/scripts/tmuxinator.sh` locally.

```
cd fedi-ffi
cargo test -- --test-threads=1
```

# Template README

## Build the library for Android

1. Fire the `buildAndroidLib` gradle task in the `fedi-android` directory
2. Publish it to your local Maven (the library will appear at `~/.m2/repository/org/fedi/fedi-android/0.1.2/`)

```shell
cd fedi-android
./gradlew buildAndroidLib
./gradlew publishToMavenLocal
```

You should then be able to use the library by adding it like any other dependency in an Android project, given you add mavenLocal() to your list of repositories to fetch dependencies from:

```kotlin
// build.gradle.kts
repositories {
    mavenCentral()
    mavenLocal()
}
```

## A few important pieces of this template

### The custom Gradle plugin for the Android library

This plugin lives in the `fedi-android/plugins/` directory, and collects the tasks of building the native binaries, building the glue code file, and putting them all in the correct places in the library to prepare for packaging. The plugin exposes the `buildAndroidLib` task to the Gradle build tool.

### The ffi-bindgen cli tool

The task of building language bindings using uniff-rs can be thought of as consisting of two steps: (1) building the native binaries for each target architecture, (2) building a "glue code" file in the target language, which will call the native binaries.

The `fedi-ffi/ffi-bingen/` directory contains a binary package which allows us to build the glue code files for each of the bindings (`fedi.kt` and `fedi.swift`) using a well-defined `uniffi-bindgen` version. In general, this cli tool can simply be downloaded from crates.io, but a requirement of the uniffi-rs library is that the native binaries produced by the `uniffi-rs` crate use the same version for that crate as the one used in the cli bindgen tool which produces the glue code. That these two versions be the same is not enforced at build time because the processes are separate, and it is therefore common for unaware contributors/developers to have problems with libraries where the binaries where produced by a different version than the glue code was. The ffi-bindgen cli tool ensures that all contributors need not downloading the uniffi-bindgen tool and instead build the glue code using the same provided tool (ffi-bindgen).

### Reducing the size of the final binaries


A special cargo profile is added with many flags turned on/off which allows to significantly reduce binary size.
