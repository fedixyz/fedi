/* eslint-disable no-console */
import { currentPlatform, Platform } from '../../configs/appium/AppiumManager'
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class OnboardingTest extends AppiumTestBase {
    async execute(): Promise<void> {
        console.log('Starting Onboarding Test')
        await this.clickElementByKey('Get a Wallet')
        await this.clickElementByKey('FediTestnetJoinButton')
        await this.clickElementByKey('Join Federation')
        await new Promise(resolve => setTimeout(resolve, 5000))
        await this.clickElementByKey('Continue')
        await this.clickElementByKey('Explore Now')
        await this.clickElementByKey('Chat')
        await this.clickElementByKey('Explore Now')
        await this.clickElementByKey('Mods')
        await this.clickElementByKey('Explore Now')
        await this.clickElementByKey('Scan')
        if ((await this.elementIsDisplayed('Continue')) === true) {
            await this.clickElementByKey('Continue')
            try {
                await this.acceptAlert('OK')
            } catch (error) {
                await this.acceptAlert('Allow')
            }
        }
        await this.clickElementByKey('Home')
        await this.clickElementByKey('AvatarButton')
        await this.waitForElementDisplayed('UserQrContainer')
        // TODO: copy the fedi user address and validate it
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 950 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 402 })
            .up({ button: 0 })
            .perform()
        await this.clickElementByKey('Edit profile')
        await this.clickElementByKey('DisplayNameInput')
        await this.typeIntoElementByKey(
            'DisplayNameInput',
            Date.now().toString(),
        )
        try {
            await this.dismissKeyboard()
            await this.clickElementByKey('DisplayNameLabel')
            await this.clickElementByKey('Save')
        } catch (error) {
            console.warn(
                `Couldn't tap Display Name text to exit keyboard or dismiss keyboard directly. Trying to proceed anyway...`,
            )
            await this.clickElementByKey('Save')
        }
        await this.waitForElementDisplayed('SuccessToast')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('Fedi Mods')
        await this.clickElementByKey('AskFediVisibilityToggleButton')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('Mods')
        if ((await this.elementIsDisplayed('Ask Fedi', 2000)) === true) {
            throw new Error(
                `Ask Fedi Mod wasn't hidden. Hiding global mods is possibly broken`,
            )
        }
        await this.clickElementByKey('AvatarButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 950 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 402 })
            .up({ button: 0 })
            .perform()
        await this.clickElementByKey('Language')
        await this.clickElementByKey('es')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        if ((await this.elementIsDisplayed('Idioma', 2000)) === false) {
            throw new Error(
                `Account should be Cuenta. Simple language change validation check failed.`,
            )
        }
        await this.clickElementByKey('Idioma')
        await this.clickElementByKey('en')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('Display currency')
        await this.clickElementByKey('ARS')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('Home')
        if ((await this.isTextPresent('ARS', false, 2000)) === false) {
            throw new Error(`Display currency change could be broken`)
        }
        await this.clickElementByKey('AvatarButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 950 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 402 })
            .up({ button: 0 })
            .perform()
        await this.clickElementByKey('Personal backup')
        await this.clickElementByKey('Continue')
        // TODO: validate backup here
        await this.clickElementByKey('Done')
        // TODO: test pin access
        // TODO: test nostr details
        await this.clickElementByKey('AvatarButton')
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 470 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 47 })
            .up({ button: 0 })
            .perform()
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 470 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 47 })
            .up({ button: 0 })
            .perform()
        if (currentPlatform === Platform.ANDROID) {
            await this.driver
                .action('pointer')
                .move({ duration: 0, x: 13, y: 470 })
                .down({ button: 0 })
                .move({ duration: 100, x: 13, y: 47 })
                .up({ button: 0 })
                .perform()
            await this.clickElementByKey('Fedi Testnet')
        } else {
            await this.clickOnText('Fedi Testnet', -2)
        }
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 360 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 60 })
            .up({ button: 0 })
            .perform()
        await this.clickElementByKey('Federation Mods')
        await this.clickElementByKey('FaucetVisibilityToggleButton')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('Home')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 470 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 47 })
            .up({ button: 0 })
            .perform()
        await this.driver
            .action('pointer')
            .move({ duration: 0, x: 13, y: 360 })
            .down({ button: 0 })
            .move({ duration: 1000, x: 13, y: 60 })
            .up({ button: 0 })
            .perform()
        if ((await this.isTextPresent('Faucet', false, 2000)) === true) {
            throw new Error(
                `Faucet Mod wasn't hidden. Hiding federation mods is possibly broken`,
            )
        }
        // TODO: go through the rest of federation settings
    }
    catch(error: any) {
        console.error('Onboarding test failed:', error)
    }
}
