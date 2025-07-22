/* eslint-disable no-console */
import { remote } from 'webdriverio'

export enum Platform {
    ANDROID = 'android',
    IOS = 'ios',
}

interface AppiumConfig {
    'appium:platformName': string
    'appium:automationName': string
    // Android-specific caps
    'appium:appPackage'?: string
    'appium:app'?: string
    'appium:appActivity'?: string
    'appium:autoGrantPermissions'?: boolean
    // iOS-specific caps
    'appium:autoAcceptAlerts'?: boolean
    'appium:platformVersion'?: string
    'appium:udid'?: string // Device UDID as it appears. Mandatory
    'appium:bundleId'?: string
    'appium:includeSafariInWebviews'?: boolean
    'appium:settings[acceptAlertButtonSelector]'?: string
}

export const currentPlatform: Platform =
    process.env.PLATFORM?.toLowerCase() === 'ios'
        ? Platform.IOS
        : Platform.ANDROID

const getCapabilities = (): AppiumConfig => {
    const commonCaps = {
        'appium:platformVersion': process.env.PLATFORM_VERSION || '',
    }

    if (currentPlatform === Platform.ANDROID) {
        return {
            ...commonCaps,
            'appium:platformName': 'Android',
            'appium:automationName': 'UiAutomator2',
            'appium:udid': process.env.DEVICE_ID || '',
            'appium:appPackage': process.env.APP_PACKAGE || 'com.fedi',
            'appium:app': process.env.BUNDLE_PATH || '',
            'appium:appActivity':
                process.env.APP_ACTIVITY || '' /*'com.fedi.MainActivity'*/,
        }
    } else {
        return {
            ...commonCaps,
            'appium:platformName': 'iOS',
            'appium:automationName': 'XCUITest',
            'appium:autoAcceptAlerts': true,
            'appium:bundleId': process.env.BUNDLE_ID || 'org.fedi.alpha',
            'appium:app': process.env.BUNDLE_PATH || '',
            'appium:includeSafariInWebviews': true,
        }
    }
}

export default class AppiumManager {
    private static instance: AppiumManager
    driver: WebdriverIO.Browser
    isInitialized = false

    static getInstance(): AppiumManager {
        if (!AppiumManager.instance) {
            AppiumManager.instance = new AppiumManager()
        }
        return AppiumManager.instance
    }

    async setup(): Promise<WebdriverIO.Browser> {
        if (!this.isInitialized) {
            console.log('Initializing Appium session...')
            this.driver = await remote({
                protocol: 'http',
                hostname: '127.0.0.1',
                port: 4723,
                path: '/',
                capabilities: getCapabilities(),
            })
            this.isInitialized = true
            console.log('Appium session initialized successfully')
        } else {
            console.log('Reusing existing Appium session')
        }
        return this.driver
    }

    async teardown(): Promise<void> {
        if (this.driver && this.isInitialized) {
            console.log('Terminating Appium session...')
            // this.driver = null
            this.isInitialized = false
            console.log('Appium session terminated')
        }
    }
}
