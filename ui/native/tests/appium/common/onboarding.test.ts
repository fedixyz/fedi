/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class OnboardingTest extends AppiumTestBase {
    async execute(): Promise<void> {
        console.log('Starting Onboarding Test')
        await new Promise(resolve => setTimeout(resolve, 10000)) // waiting for 10 seconds for the username to generate
        await this.clickElementByKey('Get started')
        await this.clickElementByKey('FediTestnetJoinButton')
        await this.clickElementByKey('JoinFederationButton')
        //TODO: validate the seed here
        await this.clickElementByKey('HomeTabButton')
        await this.clickElementByKey('ChatTabButton')
        await this.clickElementByKey('ModsTabButton')
        await this.clickElementByKey('FederationsTabButton')
        await this.clickElementByKey('ScanButton')
        if ((await this.elementIsDisplayed('Continue')) === true) {
            await this.clickElementByKey('Continue')
            try {
                await this.acceptAlert('OK')
            } catch (error) {
                await this.acceptAlert('Allow')
            }
        }
        await this.clickElementByKey('HeaderBackButton')
        await this.clickElementByKey('HomeTabButton')
        await this.clickElementByKey('AvatarButton')
        await this.waitForElementDisplayed('UserQrContainer')
        // TODO: copy the fedi user address and validate it
        await this.scrollToElement('Edit profile')
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
        await this.scrollToElement('Fedi Mini Apps')
        await this.clickElementByKey('Fedi Mini Apps')
        await this.clickElementByKey('AskFediVisibilityToggleButton')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('ModsTabButton')
        if ((await this.elementIsDisplayed('Ask Fedi', 2000)) === true) {
            throw new Error(
                `Ask Fedi Mod wasn't hidden. Hiding global mods is possibly broken`,
            )
        }
        await this.clickElementByKey('AvatarButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.scrollToElement('Language')
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
        await this.scrollToElement('Display currency')
        await this.clickElementByKey('Display currency')
        await this.clickElementByKey('ARS')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('FederationsTabButton')
        if ((await this.isTextPresent('ARS', false, 2000)) === false) {
            throw new Error(`Display currency change could be broken`)
        }
        await this.clickElementByKey('AvatarButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.scrollToElement('Personal Backup')
        await this.clickElementByKey('Personal Backup')
        await this.clickElementByKey('ContinueButton')
        // TODO: validate backup here
        // TODO: test pin access
        // TODO: test nostr details
        await this.scrollToElement('FediGlobal(Nightly)CommAccordionButton')
        await this.clickElementByKey('FediGlobal(Nightly)CommAccordionButton')
        await this.scrollToElement('Community Mini Apps')
        await this.clickElementByKey('Community Mini Apps')
        await this.clickElementByKey('BitrefillVisibilityToggleButton')
        await this.clickElementByKey('HeaderBackButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('HomeTabButton')
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.scroll('down', 100, 50)
        if ((await this.isTextPresent('Bitrefill', false, 2000)) === true) {
            throw new Error(
                `Bitrefill wasn't hidden. Hiding federation mods is possibly broken`,
            )
        }
        // TODO: go through the rest of federation settings
    }
    catch(error: unknown) {
        console.error('Onboarding test failed:', error)
    }
}
