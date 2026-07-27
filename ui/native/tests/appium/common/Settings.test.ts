/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

const TEST_DISPLAY_NAME = 'e2eprofile'
const FALLBACK_TEST_DISPLAY_NAME = 'e2eprofile2'

export class Settings extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    static produces = ['onboarded'] as const

    private async changeDisplayName(displayName: string): Promise<void> {
        await this.scrollToElement('Edit profile')
        await this.clickElementByKey('Edit profile')
        await this.waitForElementDisplayed('DisplayNameInput')
        await this.typeIntoElementByKey('DisplayNameInput', displayName)
        await this.dismissKeyboard()
        await this.clickOnText('Save', 0, true)
        await this.waitForElementDisplayed('UserQrContainer')
    }

    private async assertDisplayedName(expected: string): Promise<void> {
        const actual = await this.getTextByKey('DisplayNameProper')

        if (actual !== expected) {
            throw new Error(
                `Expected display name "${expected}", but found "${actual}"`,
            )
        }
    }

    async execute(): Promise<void> {
        console.log('Starting Settings Test')

        await this.clickElementByKey('HomeTabButton')
        await this.clickElementByKey('AvatarButton')
        await this.waitForElementDisplayed('UserQrContainer')

        // Edit profile sits at the top of the drawer, so run this leg before
        // the walk scrolls down.
        const originalDisplayName = await this.getTextByKey('DisplayNameProper')
        const updatedDisplayName =
            originalDisplayName === TEST_DISPLAY_NAME
                ? FALLBACK_TEST_DISPLAY_NAME
                : TEST_DISPLAY_NAME

        await this.changeDisplayName(updatedDisplayName)
        await this.assertDisplayedName(updatedDisplayName)

        // later suites reuse the 'onboarded' state this suite produces, so
        // the original name has to come back
        await this.changeDisplayName(originalDisplayName)
        await this.assertDisplayedName(originalDisplayName)

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

        // Visiting the Currency sub-screen leaves Settings mounted, so the
        // accordion is still expanded on return. Scroll its inner items into view
        // rather than re-toggling, since a blind tap here collapses it instead.
        if (!(await this.scrollToElement('Federation Settings'))) {
            await this.scrollToElement('FediTestnetFedAccordionButton')
            await this.clickElementByKey('FediTestnetFedAccordionButton')
            await this.scrollToElement('Federation Settings')
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
