/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class JoinLeaveFederation extends AppiumTestBase {
    async execute(): Promise<void> {
        console.log('Starting Joining Public Federation Test')
        await this.clickElementByKey('FederationsTabButton')
        await this.waitForElementDisplayed('FediTestnetDetailsButton', 2000)
        await this.clickElementByKey('PlusButton')
        await this.scrollToElement('E-CashClubJoinButton')
        await this.clickElementByKey('E-CashClubJoinButton')
        await this.waitForElementDisplayed('JoinFederationButton')
        await this.clickElementByKey('JoinFederationButton')
        if (
            (await this.elementIsDisplayed('E-CashClubDetailsButton')) === false
        ) {
            throw new Error(
                `Failed - E-Cash Club Federation is not present in the Federations drawer after joining it for the first time`,
            )
        }
        // END of the process of joining a Public Federation without TOS
        await this.clickElementByKey('PlusButton')
        await this.scrollToElement('BitcoinPrinciplesJoinButton')
        await this.clickElementByKey('BitcoinPrinciplesJoinButton')
        await this.waitForElementDisplayed('I accept')
        if (
            (await this.isTextPresent(
                `By clicking 'I accept' you agree to the terms of service at https://`,
            )) === false
        ) {
            throw new Error(
                `Failed - Terms Of Service link is not present - The Federation has TOS in config`,
            )
        }
        await this.clickElementByKey('I do not accept')
        await this.clickElementByKey('BitcoinPrinciplesJoinButton')
        await this.clickElementByKey('I accept')
        await this.waitForElementDisplayed('PlusButton')
        if (
            (await this.scrollToElement('BitcoinPrinciplesDetailsButton')) ===
            null
        ) {
            throw new Error(
                `Failed - Bitcoin Principles Federation is not present in the Federations drawer`,
            )
        }
        // END of the process of joining a Public Federation with TOS
        // await this.clickOnText('Fedi Testnet', 0, true)
        // await this.waitForElementDisplayed('FediTestnetDetailsButton') <-- these elements are no longer there
        await this.clickElementByKey('AvatarButton')
        await this.scrollToElement('BitcoinPrinciplesFedAccordionButton')
        await this.clickElementByKey('BitcoinPrinciplesFedAccordionButton')
        await this.scrollToElement('Leave Federation')
        await this.clickElementByKey('Leave Federation')
        await this.dismissAlert('No')
        await this.scrollToElement('BitcoinPrinciplesFedAccordionButton', {
            scrollDirection: 'up',
        })
        if (
            (await this.elementIsDisplayed(
                'BitcoinPrinciplesFedAccordionButton',
            )) === false
        ) {
            throw new Error(
                `Failed - Bitcoin Principles accordion is not in the account settings`,
            )
        }
        await this.scrollToElement('Leave Federation')
        await this.clickElementByKey('Leave Federation')
        await this.acceptAlert('Yes')
        if (
            (await this.elementIsDisplayed(
                'BitcoinPrinciplesFedAccordionButton',
            )) === true
        ) {
            throw new Error(
                `Failed - Bitcoin Principles accordion is in the account settings after leaving`,
            )
        }
        await this.clickElementByKey('HeaderCloseButton')
        await this.waitForElementDisplayed('PlusButton')
        if (
            (await this.scrollToElement('BitcoinPrinciplesDetailsButton')) !==
            null
        ) {
            throw new Error(
                `Failed - Bitcoin Principles Federation is still present in the Federations tab after leaving`,
            )
        }
        // END of the process of leaving a Public Federation.
        await this.clickElementByKey('FederationsTabButton')
        await this.clickElementByKey('PlusButton')
        await this.scrollToElement('BitcoinPrinciplesJoinButton')
        await this.clickElementByKey('BitcoinPrinciplesJoinButton')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        if (
            (await this.isTextPresent(
                `By clicking 'I accept' you agree to the terms of service at https://`,
            )) === false
        ) {
            throw new Error(
                `Failed - Terms Of Service link is not present after re-joining - The Federation has TOS in config`,
            )
        }
        await this.clickElementByKey('I do not accept')
        await this.clickElementByKey('BitcoinPrinciplesJoinButton')
        await this.clickElementByKey('I accept')
        await this.waitForElementDisplayed('PlusButton')
        if (
            (await this.elementIsDisplayed(
                'BitcoinPrinciplesDetailsButton',
                2000,
            )) === false
        ) {
            throw new Error(
                `Failed - Bitcoin Principles Federation is not present in the Federations tab after re-joining`,
            )
        }
        // END of the process of re-joining to a Public Federation with TOS
        // await this.clickOnText('E-Cash Club', 0, true)
        // await new Promise(resolve => setTimeout(resolve, 1000)) // if the avatar button is clicked too fast (before the animation commpletes itself), the tests get stuck
        // await this.clickAndCheckForNextElement(
        //     'AvatarButton',
        //     'HeaderCloseButton',
        // )
        await this.clickElementByKey('AvatarButton')
        await this.scrollToElement('E-CashClubFedAccordionButton')
        await this.clickElementByKey('E-CashClubFedAccordionButton')
        await this.scrollToElement('Leave Federation')
        await this.clickElementByKey('Leave Federation')
        await this.dismissAlert('No')
        await this.scrollToElement('E-CashClubFedAccordionButton', {
            scrollDirection: 'up',
        })
        if (
            (await this.elementIsDisplayed('E-CashClubFedAccordionButton')) ===
            false
        ) {
            throw new Error(
                `Failed - E-Cash Club accordion is not in the account settings`,
            )
        }
        await this.clickElementByKey('Leave Federation')
        await this.acceptAlert('Yes')
        if (
            (await this.elementIsDisplayed('E-CashClubFedAccordionButton')) ===
            true
        ) {
            throw new Error(
                `Failed - E-Cash Club accordion is in the account settings after leaving`,
            )
        }
        await this.clickElementByKey('HeaderCloseButton')
        // await this.clickElementByKey('HomeHeaderHamburger') <-- no longer used
        await this.waitForElementDisplayed('PlusButton')
        if ((await this.scrollToElement('E-CashClubDetailsButton')) !== null) {
            throw new Error(
                `Failed - E-Cash Club Federation is still present in the Federations tab after leaving`,
            )
        }
        // End of test - Leave a Federation without TOS - Same as with TOS - No difference
        await this.clickElementByKey('FederationsTabButton')
        await this.clickElementByKey('PlusButton')
        await this.scrollToElement('E-CashClubJoinButton')
        await this.clickElementByKey('E-CashClubJoinButton')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        await this.clickElementByKey('JoinFederationButton')
        await this.waitForElementDisplayed('PlusButton')
        if (
            (await this.scrollToElement('E-CashClubDetailsButton', {
                scrollDirection: 'up',
            })) === null
        ) {
            throw new Error(
                `Failed - E-Cash Club Federation is not present in the Federations drawer after re-joining`,
            )
        }
        await this.clickElementByKey('HomeTabButton')
        // END of the process of re-joining to a Public Federation without TOS
    }
    catch(error: unknown) {
        console.error('Onboarding test failed:', error)
    }
}
