/* eslint-disable no-console */
import { remote } from 'webdriverio'

import { AppiumConfigValidator } from './AppiumConfigValidator'
import { AppiumConfig, currentPlatform, Platform } from './types'

const getCapabilities = (): AppiumConfig => {
    const config = AppiumConfigValidator.getValidatedConfig()

    if (currentPlatform === Platform.PWA) {
        console.log('PWA testing is not ready yet')

        return {
            'appium:platformName': 'Web',
            'appium:automationName': 'TODO',
        }
    }

    const commonCaps = {
        'appium:platformVersion': config.PLATFORM_VERSION || '',
        'appium:udid': config.DEVICE_ID || process.env.DEVICE_ID,
        'appium:app': config.BUNDLE_PATH || process.env.BUNDLE_PATH || '',
    }

    if (currentPlatform === Platform.ANDROID) {
        return {
            ...commonCaps,
            'appium:platformName': 'Android',
            'appium:automationName': 'UiAutomator2',
            'appium:appPackage': config.APP_PACKAGE || 'com.fedi',
            'appium:appActivity':
                config.APP_ACTIVITY || '' /*'com.fedi.MainActivity'*/,
        }
    } else {
        return {
            ...commonCaps,
            'appium:platformName': 'iOS',
            'appium:automationName': 'XCUITest',
            'appium:bundleId': config.BUNDLE_ID || 'org.fedi.alpha',
            'appium:includeSafariInWebviews': true,
        }
    }
}

export default class AppiumManager {
    private static instance: AppiumManager
    driver: WebdriverIO.Browser | null
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

            try {
                AppiumConfigValidator.validateEnvironment()
            } catch (error) {
                console.error(
                    '❌ Configuration validation failed:',
                    (error as Error).message,
                )
                throw error
            }

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
        return this.driver as WebdriverIO.Browser
    }

    async teardown(): Promise<void> {
        if (this.driver && this.isInitialized) {
            console.log('Terminating Appium session...')
            await this.driver.deleteSession()
            this.driver = null
            this.isInitialized = false
            console.log('Appium session terminated')
        }
    }
}
