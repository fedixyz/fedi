/* eslint-disable no-console */
import { resources } from '@fedi/common/localization'

import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'

const en = resources.en.translation
const CREATION_TITLE = en.feature['wallet-service']['guardian-set-title']
const APP_START_TIMEOUT = 60_000
const PIN = ['1', '2', '3', '4'] as const

export class DeepLinks extends AppiumTestBase {
    static produces = ['onboardedWithoutFederation', 'pinProtected'] as const

    async execute(): Promise<void> {
        console.log('Opening a Manifold creation link before onboarding')
        await this.waitForText(
            en.phrases['get-started'],
            0,
            true,
            APP_START_TIMEOUT,
        )
        await this.terminateApp()
        await this.openDeepLink('fedi://create-manifold')
        await this.waitForText(
            en.phrases['get-started'],
            0,
            true,
            APP_START_TIMEOUT,
        )
        await this.assertCreationHidden()
        await this.clickOnText(en.phrases['get-started'], 0, true)
        await this.assertCreationOpen()
        await this.backToWallet()

        for (const url of [
            'fedi:create-manifold',
            'https://app.fedi.xyz/link?screen=create-manifold',
            'https://app.fedi.xyz/link#screen=create-manifold',
        ]) {
            console.log(`Opening a warm Manifold creation link: ${url}`)
            await this.openDeepLink(url)
            await this.assertCreationOpen()
            await this.backToWallet()
        }

        console.log('Opening a Manifold HTTPS link from a cold start')
        await this.terminateApp()
        await this.openDeepLink(
            'https://app.fedi.xyz/link?screen=create-manifold',
        )
        await this.assertCreationOpen()
        await this.backToWallet()

        await this.enablePin()
        console.log('Opening a Manifold creation link while PIN protected')
        await this.terminateApp()
        await this.openDeepLink('fedi://create-manifold')
        await this.waitForElementDisplayed('NumpadButton-1', APP_START_TIMEOUT)
        await this.assertCreationHidden()

        await this.enterPin(['0', '0', '0', '0'])
        await this.waitForText(en.feature.pin['pin-doesnt-match'], 0, true)
        await this.assertCreationHidden()
        for (let i = 0; i < PIN.length; i++) {
            await this.clickElementByKey('NumpadButton-backspace')
        }

        await this.enterPin(PIN)
        await this.assertCreationOpen()
        await this.backToWallet()
        console.log('Deep links test complete')
    }

    private async assertCreationOpen(): Promise<void> {
        await this.waitForText(CREATION_TITLE, 0, true, APP_START_TIMEOUT)
        await this.waitForElementDisplayed(
            'guardian-count-headline',
            APP_START_TIMEOUT,
        )
    }

    private async assertCreationHidden(): Promise<void> {
        if (await this.isTextPresent(CREATION_TITLE, true, 1000)) {
            throw new Error('Manifold creation bypassed onboarding or PIN')
        }
    }

    private async backToWallet(): Promise<void> {
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForText(en.feature.wallet['setup-title'], 0, true)
        await this.waitForElementDisplayed('WalletTabButton')
    }

    private async enablePin(): Promise<void> {
        await this.clickElementByKey('HomeTabButton')
        await this.clickElementByKey('AvatarButton')
        await this.waitForElementDisplayed('UserQrContainer')
        await this.scrollToElement(en.feature.pin['pin-access'])
        await this.clickElementByKey(en.feature.pin['pin-access'])
        await this.clickOnText(en.words.continue, 0, true)
        await this.waitForElementDisplayed('SeedWord12')
        await this.clickOnText(
            en.feature.backup['personal-backup-button-primary-text'],
            0,
            true,
        )
        await this.enterPin(PIN)
        await this.waitForText(en.feature.pin['re-enter-pin'], 0, true)
        await this.enterPin(PIN)
        await this.clickOnText(en.words.done, 0, true)
        await this.waitForElementDisplayed('PinSwitch-app')
    }

    private async enterPin(digits: readonly string[]): Promise<void> {
        for (const digit of digits) {
            await this.clickElementByKey(`NumpadButton-${digit}`)
        }
    }

    private async terminateApp(): Promise<void> {
        await this.driver.executeScript('mobile: terminateApp', [
            currentPlatform === Platform.IOS
                ? { bundleId: process.env.BUNDLE_ID || 'org.fedi.alpha' }
                : { appId: process.env.APP_PACKAGE || 'com.fedi' },
        ])
    }

    catch(error: unknown) {
        console.error('Deep links test failed:', error)
    }
}
