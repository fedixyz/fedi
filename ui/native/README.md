# Development Environment

To set up the development environment you will need to make sure you can build React Native applications.

Follow the guide here for your OS of choice: https://reactnative.dev/docs/environment-setup (be sure you are reading the React Native CLI Quickstart, not the Expo Go Quickstart)

1. Install dependencies

First install your Node modules with

```
yarn install
```

You will also need to [install Rust](https://www.rust-lang.org/tools/install) because all the actual interaction with the Federation happens via [this rust code](https://github.com/fedibtc/fedi-react-native/tree/master/bridge).

2. Start Metro

The Metro server is the JavaScript bundler that ships with React Native.

Make sure you are inside the root of the React Native project folder (this should be the `/ui/native` directory, at the same level as `/android` and `/ios` folders) then run:

```
yarn run start
```

3. Build the bridge

The [Rust bridge](https://github.com/fedibtc/fedi-react-native/tree/master/bridge) gets built automatically by the `npm run android` and `npm run ios` commands, but as a first run try building it independently with `npm run build-bridge-android` and `npm run build-bridge-ios`. You can build these in parallel with separate terminals.

```
# builds ios
yarn run build-bridge-ios

# builds android
yarn run build-bridge-android
```

If you have any trouble, check the [bridge/README](https://github.com/fedibtc/fedi-react-native/blob/master/bridge/README.md) and if your problem isn't covered there, open an issue.

If there are no changes to the bridge since your last build, this process should be pretty quick as it does not rebuild from scratch.

4. Run the app

Making sure your Metro Bundler is running from step 2, open a separate terminal to run the android app:

```
yarn run android
```

Open an additional terminal to run the iOS app:

```
yarn run ios
```

You should see the app running in the iOS Simulator or Android Studio emulator shortly.

If you are running an AArch64 Mac (M1/M2) and see an error when running `npm run ios` instead try:

```
yarn run ios-arm64
```

If you still have trouble, open the `/ui/native/ios/FediReactNative.xcworkspace` in Xcode and try running the app from there. Otherwise, double-check your React Native environment setup before opening an issue.

## Directory Structure

-   `/screens`
    -   contains React components that are directly accessible by the navigator
    -   need to be properly typed and added to the `Router`
-   `/components` folder
    -   contains React components categorized by `/feature`
    -   consider creating a new folder if building something that does not fall into one of the existing `/feature` categories
    -   `/components/ui` is for more generalized components expected to be reused in many (3+) different components or screens

## Style Guide

TODO:...

## troubleshooting

Read android logs off emulator:

```
adb -s <emulator> shell "run-as com.fedi cat /data/user/0/com.fedi/files/fedi.log" > fedi.log
```

Set `FEDI_EMULATOR=1` to only compile rust code for `aarch64-linux-android`, which is what Justin's emulator uses. Not sure if all emulators use this. Improve later ...

### To run 2 android emulators:

```
yarn run start
yarn run android
yarn run android -- --deviceid=<deviceid>
```

### list iOS device IDs

```
xcrun xctrace list devices
```

### Cannot connect to development server

On an Android simulator, if the app installs but cannot connect to the Metro packaging server (usually running on port 8081) try running `adb reverse tcp:8081 tcp:8081` to resolve the problem. (see [this guide](https://reactnative.dev/docs/running-on-device?platform=android#method-1-using-adb-reverse-recommended) for details)
