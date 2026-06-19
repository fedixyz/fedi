/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'

const IOS_BUNDLE_ID = process.env.BUNDLE_ID || 'org.fedi.alpha'
const ANDROID_APP_ID = process.env.APP_PACKAGE || 'com.fedi'

const PIN_DIGITS = ['1', '2', '3', '4'] as const

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

        await this.enterPin(['0', '0', '0', '0'])

        if (
            !(await this.isTextPresent("PIN doesn't match")) ||
            !(await this.isTextPresent('Forgot your PIN?'))
        )
            throw new Error('PIN should be incorrect')
        await this.clearPin()

        console.log('Unlocking app with correct PIN')

        await this.enterPin(PIN_DIGITS)
        await this.waitForElementDisplayed('HomeTabButton')

        console.log('PIN Protection Test complete')
    }

    catch(error: unknown) {
        console.error('PIN Protection test failed:', error)
    }
}
