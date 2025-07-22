#!/usr/bin/env bash

# exit on failure
set -euo pipefail

# this script copies prebuilt bridge libraries from FEDI_BRIDGE_ANDROID_LIBS_OUT
# and packages them as a kotlin library so the react native app can find it as a local maven dependency

# make sure to set the gradle user home so gradle doesn't try to use global cache in CI
export GRADLE_USER_HOME=$HOME/.gradle
echo "GRADLE_USER_HOME set to: $GRADLE_USER_HOME"

BRIDGE_ANDROID_ROOT=$REPO_ROOT/bridge/fedi-android
BRIDGE_LIBS_SOURCE=${FM_BUILD_BRIDGE_ANDROID_LIBS_OUT:-$BRIDGE_ANDROID_ROOT/kotlinLibDeps}
JNI_LIBS_DEST=$BRIDGE_ANDROID_ROOT/lib/src/main/jniLibs
FFI_LIB_DEST=$BRIDGE_ANDROID_ROOT/lib/src/main/kotlin

copy_deps() {
    echo "Looking for bridge libraries in: $BRIDGE_LIBS_SOURCE"
    mkdir -p "$JNI_LIBS_DEST"
    mkdir -p "$FFI_LIB_DEST"
    if [ -d "$BRIDGE_LIBS_SOURCE" ]; then
        echo "Copying from $BRIDGE_LIBS_SOURCE/jniLibs/* to $JNI_LIBS_DEST..."
        cp -r "$BRIDGE_LIBS_SOURCE"/jniLibs/* "$JNI_LIBS_DEST"/ || true
        echo "Copying from $BRIDGE_LIBS_SOURCE/fedi-ffi/* to $FFI_LIB_DEST..."
        cp -r "$BRIDGE_LIBS_SOURCE"/fedi-ffi/* "$FFI_LIB_DEST"/ || true
        # Ensure copied files and directories are writable (Nix store files are read-only) so we can clean up later
        chmod -R u+w "$JNI_LIBS_DEST" 2>/dev/null || true
        chmod -R u+w "$FFI_LIB_DEST" 2>/dev/null || true
    fi
}

publish_to_maven() {
    echo "Publishing to local maven repository..."
    mkdir -p "$ANDROID_BRIDGE_ARTIFACTS"
    pushd "$BRIDGE_ANDROID_ROOT"
    ./gradlew publishMavenPublicationToFediAndroidRepository
    echo "Local maven repository published to $ANDROID_BRIDGE_ARTIFACTS."
    popd
}

cleanup() {
    # clean up intermediate deps since everything we need is now in
    # ANDROID_BRIDGE_ARTIFACTS ready for application use
    echo "Cleaning up intermediate dependencies..."
    echo "Removing $JNI_LIBS_DEST"
    rm -rf "$JNI_LIBS_DEST" || true
    echo "Removing $FFI_LIB_DEST"
    rm -rf "$FFI_LIB_DEST" || true
}

copy_deps
publish_to_maven
cleanup
