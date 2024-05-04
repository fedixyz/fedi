/** @type {Detox.DetoxConfig} */
module.exports = {
    logger: {
        level: 'debug',
    },
    testRunner: {
        args: {
            $0: 'jest',
            config: 'tests/configs/jest-detox.config.js',
        },
        jest: {
            setupTimeout: 120000,
        },
    },
    apps: {
        'ios.debug': {
            type: 'ios.app',
            binaryPath:
                'ios/build/Build/Products/Debug-iphonesimulator/FediReactNative.app',
            build: 'xcodebuild -workspace ios/FediReactNative.xcworkspace -scheme FediReactNative -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
        },
        'ios.release': {
            type: 'ios.app',
            binaryPath:
                'ios/build/Build/Products/Release-iphonesimulator/FediReactNative.app',
            build: 'xcodebuild -workspace ios/FediReactNative.xcworkspace -scheme FediReactNative -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
        },
        'android.debug': {
            type: 'android.apk',
            binaryPath:
                'android/app/build/outputs/apk/production/debug/app-production-debug.apk',
            build: 'cd android ; ./gradlew assembleProductionDebug assembleAndroidTest -DtestBuildType=debug ; cd -',
            reversePorts: [8081],
        },
        'android.release': {
            type: 'android.apk',
            binaryPath:
                'android/app/build/outputs/apk/production/release/app-production-release.apk',
            build: 'cd android ; ./gradlew assembleProductionRelease assembleAndroidTest -DtestBuildType=release ; cd -',
        },
    },
    devices: {
        simulator: {
            type: 'ios.simulator',
            device: {
                type: 'iPhone 14',
            },
        },
        attached: {
            type: 'android.attached',
            device: {
                adbName: '.*',
            },
        },
        emulator: {
            type: 'android.emulator',
            device: {
                avdName: 'Pixel_4_API_31',
            },
        },
    },
    configurations: {
        'ios.sim.debug': {
            device: 'simulator',
            app: 'ios.debug',
        },
        'ios.sim.release': {
            device: 'simulator',
            app: 'ios.release',
        },
        'android.att.debug': {
            device: 'attached',
            app: 'android.debug',
        },
        'android.att.release': {
            device: 'attached',
            app: 'android.release',
        },
        'android.emu.debug': {
            device: 'emulator',
            app: 'android.debug',
        },
        'android.emu.release': {
            device: 'emulator',
            app: 'android.release',
        },
    },
}
