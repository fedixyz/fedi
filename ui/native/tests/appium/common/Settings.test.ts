/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class Settings extends AppiumTestBase {
    async execute(): Promise<void> {
        console.log('Starting Settings Test')

        await this.clickElementByKey('HomeTabButton')
        await this.clickElementByKey('AvatarButton')
        await this.waitForElementDisplayed('UserQrContainer')

        await this.scrollToElement('App Settings')
        await this.clickElementByKey('App Settings')
        if ((await this.isTextPresent('Usage sharing')) === false) {
            throw new Error(
                'Failed - App Settings screen did not render the usage sharing toggle',
            )
        }
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForElementDisplayed('UserQrContainer')

        await this.scrollToElement('FediTestnetFedAccordionButton')
        await this.clickElementByKey('FediTestnetFedAccordionButton')

        await this.scrollToElement('Currency')
        await this.clickElementByKey('Currency')
        if ((await this.isTextPresent('Federation default')) === false) {
            throw new Error(
                'Failed - Federation Currency screen did not render the federation default label',
            )
        }
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForElementDisplayed('UserQrContainer')

        // Back nav collapses the accordion; re-open if the inner items aren't visible.
        await this.scrollToElement('FediTestnetFedAccordionButton', {
            scrollDirection: 'up',
        })
        if (
            (await this.elementIsDisplayed('Federation Settings', 2000)) ===
            false
        ) {
            await this.clickElementByKey('FediTestnetFedAccordionButton')
            await this.waitForElementDisplayed('Federation Settings')
        }
        await this.clickElementByKey('Federation Settings')
        if ((await this.isTextPresent('Repair Wallet')) === false) {
            throw new Error(
                'Failed - Federation Settings screen did not render the repair wallet action',
            )
        }
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForElementDisplayed('UserQrContainer')

        await this.scrollToElement('Share logs')
        await this.clickElementByKey('Share logs')
        if (
            (await this.isTextPresent(
                'Enter the ticket number given by our team',
            )) === false
        ) {
            throw new Error(
                'Failed - Share Logs screen did not render the ticket number prompt',
            )
        }
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForElementDisplayed('UserQrContainer')

        // Guardian Fees: not reachable from the settings drawer — the only entry
        // point is a guardian-bot chat form event (see ChatFormEvent.tsx). Until
        // there's a navigable path or a deterministic way to seed that event,
        // walking through it from a fresh runner is not feasible.

        await this.clickElementByKey('HeaderCloseButton')
    }
    catch(error: unknown) {
        console.error('Settings test failed:', error)
    }
}
