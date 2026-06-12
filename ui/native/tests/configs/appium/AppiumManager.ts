/* eslint-disable no-console */
import { remote } from 'webdriverio'

import { AppiumConfigValidator } from './AppiumConfigValidator'
import { AppiumConfig, currentPlatform, Platform } from './types'

// 'a' is the primary actor and back-compat with unsuffixed env vars
// (DEVICE_ID, AVD). Additional actors use suffixed forms (DEVICE_ID_B,
// AVD_B, ...).
const HANDLE_INDEX: Record<string, number> = { a: 0, b: 1 }

function envForHandle(name: string, handle: string): string | undefined {
    const suffix = handle.toUpperCase()
    const suffixed = process.env[`${name}_${suffix}`]
    if (suffixed) return suffixed
    if (handle === 'a') return process.env[name]
    return undefined
}

const getCapabilities = (handle: string): AppiumConfig => {
    const config = AppiumConfigValidator.getValidatedConfig()
    const idx = HANDLE_INDEX[handle]
    if (idx === undefined) {
        throw new Error(
            `Unknown actor handle "${handle}". Add it to HANDLE_INDEX in AppiumManager.ts.`,
        )
    }

    if (currentPlatform === Platform.PWA) {
        console.log('PWA testing is not ready yet')
        return {
            'appium:platformName': 'Web',
            'appium:automationName': 'TODO',
        }
    }

    const commonCaps = {
        'appium:platformVersion': config.PLATFORM_VERSION || '',
        'appium:app': config.BUNDLE_PATH || process.env.BUNDLE_PATH || '',
    }

    if (currentPlatform === Platform.ANDROID) {
        const udid = envForHandle('DEVICE_ID', handle)
        const avd = envForHandle('AVD', handle)
        if (!udid && !avd) {
            throw new Error(
                `Actor "${handle}" needs DEVICE_ID_${handle.toUpperCase()} or AVD_${handle.toUpperCase()}` +
                    (handle === 'a'
                        ? ' (or the unsuffixed DEVICE_ID/AVD)'
                        : ''),
            )
        }
        return {
            ...commonCaps,
            'appium:platformName': 'Android',
            'appium:avd': avd,
            'appium:udid': udid,
            'appium:automationName': 'UiAutomator2',
            'appium:appPackage': config.APP_PACKAGE || 'com.fedi',
            'appium:appActivity': config.APP_ACTIVITY || '',
            // Auto-grant all runtime perms at install so no permission
            // dialog blocks an actor. The driver is the Android 13+
            // POST_NOTIFICATIONS prompt: an idle secondary actor can't
            // dismiss it and it covers the tab bar.
            'appium:autoGrantPermissions': true,
            'appium:uiautomator2ServerInstallTimeout': 120000,
            'appium:uiautomator2ServerLaunchTimeout': 120000,
            // Default 60s tears the secondary session down while the
            // primary drives a long multi-step phase.
            'appium:newCommandTimeout': 600,
            // UiAutomator2 server port per session. Collisions between
            // sessions hang the second driver init silently.
            'appium:systemPort': 8200 + idx * 100,
            'appium:chromedriverPort': 9515 + idx,
        }
    } else {
        const udid = envForHandle('DEVICE_ID', handle)
        if (!udid) {
            throw new Error(
                `Actor "${handle}" needs DEVICE_ID_${handle.toUpperCase()}` +
                    (handle === 'a' ? ' (or the unsuffixed DEVICE_ID)' : ''),
            )
        }
        return {
            ...commonCaps,
            'appium:platformName': 'iOS',
            'appium:automationName': 'XCUITest',
            'appium:udid': udid,
            'appium:bundleId': process.env.BUNDLE_ID || 'org.fedi.alpha',
            'appium:includeSafariInWebviews': true,
            'appium:wdaStartupRetries': 4,
            'appium:wdaStartupRetryInterval': 20000,
            'appium:wdaLaunchTimeout': 120000,
            'appium:wdaConnectionTimeout': 120000,
            'appium:simulatorStartupTimeout': 120000,
            'appium:connectHardwareKeyboard': false,
            'appium:newCommandTimeout': 600,
            // WDA port per session; sharing this kills the prior session
            // (see appium/appium#20512).
            'appium:wdaLocalPort': 8100 + idx * 100,
            'appium:derivedDataPath': `${process.env.HOME ?? '/tmp'}/Library/Developer/Xcode/DerivedData/wda-${handle}`,
        }
    }
}

interface Session {
    driver: WebdriverIO.Browser
}

export default class AppiumManager {
    private static sessions = new Map<string, Session>()
    private static envValidated = false

    static async setupSession(handle: string): Promise<WebdriverIO.Browser> {
        const existing = AppiumManager.sessions.get(handle)
        if (existing) {
            console.log(`Reusing existing Appium session for actor "${handle}"`)
            return existing.driver
        }

        if (!AppiumManager.envValidated) {
            try {
                AppiumConfigValidator.validateEnvironment()
            } catch (error) {
                console.error(
                    '❌ Configuration validation failed:',
                    (error as Error).message,
                )
                throw error
            }
            AppiumManager.envValidated = true
        }

        const appiumPort = parseInt(process.env.APPIUM_PORT || '4723', 10)
        const debugMode =
            process.env.DEBUG_MODE === '1' || process.env.DEBUG_MODE === 'true'

        console.log(`Initializing Appium session for actor "${handle}"...`)
        const driver = await remote({
            protocol: 'http',
            hostname: '127.0.0.1',
            port: appiumPort,
            path: '/',
            logLevel: debugMode ? 'info' : 'warn',
            capabilities: getCapabilities(handle),
        })
        AppiumManager.sessions.set(handle, { driver })

        if (currentPlatform === Platform.ANDROID) {
            // An idle actor's screen blanks at the ~30s default, after
            // which the UI tree empties and findElement returns nothing.
            // Run after the session is up so the device is confirmed
            // ready (needs --allow-insecure=uiautomator2:adb_shell).
            try {
                await driver.executeScript('mobile: shell', [
                    {
                        command: 'settings',
                        args: [
                            'put',
                            'system',
                            'screen_off_timeout',
                            '2147483647',
                        ],
                    },
                ])
                await driver.executeScript('mobile: shell', [
                    { command: 'svc', args: ['power', 'stayon', 'true'] },
                ])
            } catch (error) {
                console.warn(
                    `Could not disable screen-off for "${handle}": ${(error as Error).message}`,
                )
            }
        }

        console.log(`Appium session for actor "${handle}" initialized`)
        return driver
    }

    static async teardownSession(handle: string): Promise<void> {
        const session = AppiumManager.sessions.get(handle)
        if (!session) return
        console.log(`Terminating Appium session for actor "${handle}"...`)
        try {
            await session.driver.deleteSession()
        } catch (error) {
            console.error(
                `Error terminating actor "${handle}": ${(error as Error).message}`,
            )
        }
        AppiumManager.sessions.delete(handle)
        console.log(`Appium session for actor "${handle}" terminated`)
    }

    static async teardownAll(): Promise<void> {
        const handles = Array.from(AppiumManager.sessions.keys())
        for (const handle of handles) {
            await AppiumManager.teardownSession(handle)
        }
    }

    static getDriver(handle: string): WebdriverIO.Browser | null {
        return AppiumManager.sessions.get(handle)?.driver ?? null
    }

    static activeHandles(): string[] {
        return Array.from(AppiumManager.sessions.keys())
    }

    static deviceId(handle: string): string | undefined {
        return envForHandle('DEVICE_ID', handle)
    }

    static actorConfigured(handle: string): boolean {
        if (currentPlatform === Platform.IOS) {
            return Boolean(envForHandle('DEVICE_ID', handle))
        }
        if (currentPlatform === Platform.ANDROID) {
            return (
                Boolean(envForHandle('DEVICE_ID', handle)) ||
                Boolean(envForHandle('AVD', handle))
            )
        }
        return false
    }
}
