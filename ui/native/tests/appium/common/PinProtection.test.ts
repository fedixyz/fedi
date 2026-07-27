/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'

const IOS_BUNDLE_ID = process.env.BUNDLE_ID || 'org.fedi.alpha'
const ANDROID_APP_ID = process.env.APP_PACKAGE || 'com.fedi'

const PIN_DIGITS = ['1', '2', '3', '4'] as const
const NEW_PIN = ['4', '3', '2', '1'] as const
const WRONG_PIN = ['0', '0', '0', '0'] as const

// A terminate + relaunch cold-starts the app, which can lag on a loaded CI
// emulator before the lock screen mounts; give it a generous upper bound.
const LOCK_SCREEN_TIMEOUT = 60_000

export class PinProtection extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    // The test leaves the app with a PIN set and app-lock enabled, which the
    // 'onboarded' state alone does not capture. Declaring the extra
    // 'pinProtected' state forces the runner to reset to fresh before any test
    // that follows (ensureState resets when current state exceeds what's
    // needed), so this test is safe in any order rather than only last.
    static produces = ['onboarded', 'pinProtected'] as const

    private async enterPin(digits: readonly string[]): Promise<void> {
        for (const digit of digits) {
            await this.clickElementByKey(`NumpadButton-${digit}`)
        }
    }

    private async clearPin(): Promise<void> {
        for (let i = 0; i < PIN_DIGITS.length; i++) {
            await this.clickElementByKey(`NumpadButton-backspace`)
        }
    }

    private async relaunchApp(): Promise<void> {
        console.log('Terminating and relaunching app to trigger lock screen')
        if (currentPlatform === Platform.IOS) {
            await this.driver.executeScript('mobile: terminateApp', [
                { bundleId: IOS_BUNDLE_ID },
            ])
            await this.driver.executeScript('mobile: activateApp', [
                { bundleId: IOS_BUNDLE_ID },
            ])
            return
        }
        if (currentPlatform === Platform.ANDROID) {
            await this.driver.executeScript('mobile: terminateApp', [
                { appId: ANDROID_APP_ID },
            ])
            await this.driver.executeScript('mobile: activateApp', [
                { appId: ANDROID_APP_ID },
            ])
            return
        }
        throw new Error(
            'PIN protection test is not implemented for this platform',
        )
    }

    async execute(): Promise<void> {
        console.log('Starting PIN Protection Test')

        await this.clickElementByKey('HomeTabButton')
        await this.clickElementByKey('AvatarButton')
        await this.waitForElementDisplayed('UserQrContainer')

        console.log('Navigating to PIN settings')

        await this.scrollToElement('PIN Access')
        await this.clickElementByKey('PIN Access')
        await this.waitForElementDisplayed('Continue')
        await this.clickElementByKey('Continue')
        await this.waitForElementDisplayed('SeedWord12')

        // The backup interstitial is the one place the seed words are on
        // screen, and the reset leg needs them later to recover the PIN.
        const seedWords: string[] = []
        for (let i = 1; i <= 12; i++) {
            seedWords.push(await this.getTextByKey(`SeedWord${i}`))
        }

        await this.clickElementByKey("I've stored it safely")

        await this.waitForElementDisplayed('NumpadButton-1')

        console.log('Entering new PIN')

        await this.enterPin(PIN_DIGITS)
        if (!(await this.isTextPresent('Re-enter PIN')))
            throw new Error('Re-enter PIN not found')

        console.log('Confirming new PIN')

        await this.enterPin(PIN_DIGITS)
        await this.waitForElementDisplayed('Done')
        await this.clickElementByKey('Done')

        const pinSwitch = await this.findElementByKey('PinSwitch-app')
        if (!pinSwitch)
            throw new Error('PinSwitch-app not found after setting PIN')

        // Android exposes the toggle state as `checked` ("true"/"false"); iOS
        // exposes it as `value` ("1"/"0").
        const isPinEnabled =
            currentPlatform === Platform.IOS
                ? (await pinSwitch.getAttribute('value')) === '1'
                : (await pinSwitch.getAttribute('checked')) === 'true'

        if (!isPinEnabled)
            throw new Error('Pin switch not enabled after setting PIN')

        await this.relaunchApp()

        console.log('Waiting for lock screen to mount')

        await this.waitForElementDisplayed(
            'NumpadButton-1',
            LOCK_SCREEN_TIMEOUT,
        )

        console.log('Entering incorrect PIN to verify lock enforcement')

        await this.enterPin(WRONG_PIN)

        if (
            !(await this.isTextPresent("PIN doesn't match")) ||
            !(await this.isTextPresent('Forgot your PIN?'))
        )
            throw new Error('PIN should be incorrect')
        await this.clearPin()

        console.log('Unlocking app with correct PIN')

        await this.enterPin(PIN_DIGITS)
        await this.waitForElementDisplayed('HomeTabButton')

        await this.resetPinWithSeedWords(seedWords)
        await this.verifyOnlyNewPinUnlocks()

        console.log('PIN Protection Test complete')
    }

    private async resetPinWithSeedWords(seedWords: string[]): Promise<void> {
        console.log('Resetting PIN through the forgot-PIN recovery flow')

        await this.relaunchApp()
        await this.waitForElementDisplayed(
            'NumpadButton-1',
            LOCK_SCREEN_TIMEOUT,
        )

        await this.enterPin(WRONG_PIN)
        await this.waitForElementDisplayed('ForgotPinButton')
        await this.clickElementByKey('ForgotPinButton')
        await this.waitForText('Recover with your backup', 0, true)
        await this.clickElementByKey('Continue')

        for (let i = 0; i < seedWords.length; i++) {
            const key = `SeedWordInput${i + 1}`
            await this.scrollToElement(key)
            await this.typeIntoElementByKey(key, seedWords[i])
        }

        await this.clickElementByKey('Recover wallet')
        await this.waitForElementDisplayed('NumpadButton-1')

        await this.enterPin(NEW_PIN)
        if (!(await this.isTextPresent('Re-enter PIN'))) {
            throw new Error('Re-enter PIN prompt not found after reset')
        }

        await this.enterPin(NEW_PIN)
        await this.waitForElementDisplayed('Done')
        await this.clickElementByKey('Done')
        await this.waitForElementDisplayed('PinSwitch-app')
    }

    private async verifyOnlyNewPinUnlocks(): Promise<void> {
        console.log('Verifying old PIN is rejected and new PIN unlocks')

        await this.relaunchApp()
        await this.waitForElementDisplayed(
            'NumpadButton-1',
            LOCK_SCREEN_TIMEOUT,
        )

        await this.enterPin(PIN_DIGITS)
        if (!(await this.isTextPresent("PIN doesn't match"))) {
            throw new Error('Old PIN should be rejected after reset')
        }
        await this.clearPin()

        await this.enterPin(NEW_PIN)
        await this.waitForElementDisplayed('HomeTabButton')
    }

    catch(error: unknown) {
        console.error('PIN Protection test failed:', error)
    }
}
