/* eslint-disable no-console */
import { RequiredEnvVars, EnvVarValidation, Platform } from './types'

export class AppiumConfigValidator {
    private static requiredVars: RequiredEnvVars = {
        common: ['PLATFORM'],
        android: [],
        ios: ['DEVICE_ID'],
        pwa: [],
    }

    private static optionalVars: Record<Platform | 'common', string[]> = {
        common: [],
        android: ['PLATFORM_VERSION', 'BUNDLE_PATH', 'DEVICE_ID', 'AVD'],
        ios: ['PLATFORM_VERSION', 'BUNDLE_PATH'],
        pwa: [],
    }

    private static validations: EnvVarValidation[] = [
        {
            name: 'PLATFORM',
            validator: value =>
                ['android', 'ios', 'pwa'].includes(value.toLowerCase()),
            errorMessage: 'PLATFORM must be either "android", "ios", or "pwa"',
        },
        {
            name: 'DEVICE_ID',
            platforms: [Platform.IOS],
            validator: value => value.length > 0,
            errorMessage: 'DEVICE_ID cannot be empty',
        },
        {
            name: 'AVD',
            platforms: [Platform.ANDROID],
            validator: value => value.length > 0,
            errorMessage: 'AVD cannot be empty',
        },
        {
            name: 'BUNDLE_PATH',
            platforms: [Platform.ANDROID, Platform.IOS],
            validator: value => {
                return (
                    value.endsWith('.apk') ||
                    value.endsWith('.ipa') ||
                    value.endsWith('.app') ||
                    value.startsWith('http')
                )
            },
            errorMessage:
                'BUNDLE_PATH must be a valid .apk, .ipa, .app file path or URL',
        },
        // TODO: add pwa validation, check draft branches
    ]

    static validateEnvironment(): void {
        console.log('🔍 Validating environment variables...')

        const platform = process.env.PLATFORM?.toLowerCase() as Platform
        if (!platform) {
            throw new Error(
                'PLATFORM environment variable is required and must be set first',
            )
        }

        // Special handling for Android platform
        if (platform === 'android') {
            if (!process.env.DEVICE_ID && !process.env.AVD) {
                throw new Error(
                    `Missing required environment variables for ANDROID: Either DEVICE_ID or AVD must be provided\n\n` +
                        `Please set one of the following environment variables:\n${this.getExampleConfig(platform)}\n\n` +
                        `You can either:\n` +
                        `1. Export them in your shell: export PLATFORM=${platform}\n` +
                        `2. Use a .env file with dotenv\n` +
                        `3. Pass them when running: PLATFORM=${platform} yarn run ts-node ./path/to/runner.ts`,
                )
            }
        }

        const platformSpecificVars = this.getPlatformRequiredVars(platform)
        const allRequiredVars = [
            ...this.requiredVars.common,
            ...platformSpecificVars,
        ]

        const missing = allRequiredVars.filter(key => !process.env[key])
        if (missing.length > 0) {
            this.throwFormattedError(missing, platform)
        }

        const errors: string[] = []
        for (const validation of this.validations) {
            if (
                validation.platforms &&
                !validation.platforms.includes(platform)
            ) {
                continue
            }

            const value = process.env[validation.name]
            if (value && validation.validator && !validation.validator(value)) {
                errors.push(
                    validation.errorMessage ||
                        `Invalid value for ${validation.name}`,
                )
            }
        }

        if (errors.length > 0) {
            throw new Error(
                `Environment variable validation failed:\n${errors.join('\n')}`,
            )
        }

        console.log('✅ Environment variables validated successfully')
        this.logConfiguration()
    }

    private static getPlatformRequiredVars(platform: Platform): string[] {
        return this.requiredVars[platform] || []
    }

    private static getPlatformOptionalVars(platform: Platform): string[] {
        return [
            ...(this.optionalVars.common || []),
            ...(this.optionalVars[platform] || []),
        ]
    }

    private static throwFormattedError(
        missing: string[],
        platform: Platform,
    ): never {
        const exampleConfig = this.getExampleConfig(platform)

        throw new Error(
            `Missing required environment variables for ${platform.toUpperCase()}: ${missing.join(', ')}\n\n` +
                `Please set the following environment variables:\n${exampleConfig}\n\n` +
                `You can either:\n` +
                `1. Export them in your shell: export PLATFORM=${platform}\n` +
                `2. Use a .env file with dotenv\n` +
                `3. Pass them when running: PLATFORM=${platform} yarn run ts-node ./path/to/runner.ts`,
        )
    }

    private static getExampleConfig(platform: Platform): string {
        switch (platform) {
            case 'android':
                return `
# Android Configuration
export PLATFORM=android
# Provide either AVD or DEVICE_ID (or both)
export AVD=android-7.1  # Run 'emulator -list-avds' to get this
# OR
export DEVICE_ID=emulator-5554  # Run 'adb devices' to get this
export BUNDLE_PATH=/path/to/app-debug.apk
export APP_PACKAGE=com.fedi
export APP_ACTIVITY=com.fedi.MainActivity
export PLATFORM_VERSION=7.1  # Optional
                `.trim()

            case 'ios':
                return `
# iOS Configuration
export PLATFORM=ios
export DEVICE_ID=0000000-000A1C2A0C61402E  # Run 'xcrun simctl list' to get this
export BUNDLE_PATH=/path/to/YourApp.app
export BUNDLE_ID=org.fedi.alpha
export PLATFORM_VERSION=18.1  # Optional
                `.trim()

            case 'pwa':
                return `
# PWA Configuration example has not been completed yet
                `.trim()

            default:
                throw new Error(`Unknown platform: ${platform}`)
        }
    }

    private static logConfiguration(): void {
        const platform = process.env.PLATFORM?.toLowerCase() as Platform
        console.log('\n📱 Test Configuration:')
        console.log(`   Platform: ${platform}`)

        switch (platform) {
            case 'android':
                if (process.env.DEVICE_ID) {
                    console.log(`   Device ID: ${process.env.DEVICE_ID}`)
                }
                if (process.env.AVD) {
                    console.log(`   AVD: ${process.env.AVD}`)
                }
                console.log(`   Bundle Path: ${process.env.BUNDLE_PATH}`)
                console.log(`   App Package: ${process.env.APP_PACKAGE}`)
                console.log(`   App Activity: ${process.env.APP_ACTIVITY}`)
                if (process.env.PLATFORM_VERSION) {
                    console.log(
                        `   Platform Version: ${process.env.PLATFORM_VERSION}`,
                    )
                }
                break

            case 'ios':
                console.log(`   Device ID: ${process.env.DEVICE_ID}`)
                console.log(`   Bundle Path: ${process.env.BUNDLE_PATH}`)
                console.log(`   Bundle ID: ${process.env.BUNDLE_ID}`)
                if (process.env.PLATFORM_VERSION) {
                    console.log(
                        `   Platform Version: ${process.env.PLATFORM_VERSION}`,
                    )
                }
                break

            case 'pwa':
                console.log(`   TODO`)
                break
        }

        console.log('')
    }

    static getValidatedConfig(): Record<string, string> {
        const config: Record<string, string> = {}
        const platform = process.env.PLATFORM?.toLowerCase() as Platform

        const requiredVars = [
            ...this.requiredVars.common,
            ...this.getPlatformRequiredVars(platform),
        ]

        const optionalVars = this.getPlatformOptionalVars(platform)
        const allVars = [...requiredVars, ...optionalVars]

        for (const varName of allVars) {
            if (process.env[varName]) {
                config[varName] = process.env[varName]
            }
        }

        return config
    }

    static isPWAPlatform(): boolean {
        return process.env.PLATFORM?.toLowerCase() === 'pwa'
    }

    static isMobilePlatform(): boolean {
        const platform = process.env.PLATFORM?.toLowerCase()
        return platform === 'android' || platform === 'ios'
    }
}
