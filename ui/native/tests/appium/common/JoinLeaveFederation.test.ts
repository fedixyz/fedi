/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class JoinLeaveFederation extends AppiumTestBase {
    async execute(): Promise<void> {
        console.log('Starting Joining Public Test')
        await this.clickElementByKey('HomeHeaderHamburger')
        await this.clickElementByKey('AddFederationButton')
        await this.clickElementByKey('E-CashClubJoinButton')
        await this.waitForElementDisplayed('JoinFederationButton')
        await this.clickElementByKey('JoinFederationButton')
        await this.waitForElementDisplayed('E-CashClubSelectorButton')
        await this.clickElementByKey('E-CashClubSelectorButton')
        if ((await this.elementIsDisplayed('E-Cash Club', 2000)) === false) {
            throw new Error(
                `Failed - E-Cash Club Federation is not present in the Federations drawer`,
            )
        }
        // END of the process of joining a Public Federation without TOS
        await this.clickElementByKey('AddFederationButton')
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
        await this.waitForElementDisplayed('BitcoinPrinciplesSelectorButton')
        await this.clickElementByKey('BitcoinPrinciplesSelectorButton')
        if (
            (await this.elementIsDisplayed('Bitcoin Principles', 2000)) ===
            false
        ) {
            throw new Error(
                `Failed - Bitcoin Principles Federation is not present in the Federations drawer`,
            )
        }
        // END of the process of joining a Public Federation with TOS
        await this.clickOnText('Fedi Testnet', 0, true)
        await this.waitForElementDisplayed('FediTestnetSelectorButton')
        await this.clickElementByKey('AvatarButton')
        await this.scrollToElement('BitcoinPrinciplesAccordionButton')
        await this.clickElementByKey('BitcoinPrinciplesAccordionButton')
        await this.scrollToElement('Leave Federation')
        await this.clickElementByKey('Leave Federation')
        await this.dismissAlert('No')
        await this.scrollToElement('BitcoinPrinciplesAccordionButton', {
            scrollDirection: 'up',
        })
        if (
            (await this.elementIsDisplayed(
                'BitcoinPrinciplesAccordionButton',
            )) === false
        ) {
            throw new Error(
                `Failed - Bitcoin Principles accordion is not in the account settings`,
            )
        }
        await this.clickElementByKey('Leave Federation')
        await this.acceptAlert('Yes')
        if (
            (await this.elementIsDisplayed(
                'BitcoinPrinciplesAccordionButton',
            )) === true
        ) {
            throw new Error(
                `Failed - Bitcoin Principles accordion is in the account settings after leaving`,
            )
        }
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('HomeHeaderHamburger')
        if (
            (await this.elementIsDisplayed('Bitcoin Principles', 2000)) === true
        ) {
            throw new Error(
                `Failed - Bitcoin Principles Federation is still present in the Federations drawer after leaving`,
            )
        }
        // END of the process of leaving a Public Federation.
        await this.clickElementByKey('AddFederationButton')
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
        await this.clickElementByKey('BitcoinPrinciplesSelectorButton')
        await this.waitForElementDisplayed('AddFederationButton')
        if (
            (await this.elementIsDisplayed('Bitcoin Principles', 2000)) ===
            false
        ) {
            throw new Error(
                `Failed - Bitcoin Principles Federation is not present in the Federations drawer after re-joining`,
            )
        }
        // END of the process of re-joining to a Public Federation with TOS
        await this.clickOnText('E-Cash Club', 0, true)
        await this.clickElementByKey('AvatarButton')
        await this.scrollToElement('E-CashClubAccordionButton')
        await this.clickElementByKey('E-CashClubAccordionButton')
        await this.scrollToElement('Leave Federation')
        await this.clickElementByKey('Leave Federation')
        await this.dismissAlert('No')
        await this.scrollToElement('E-CashClubAccordionButton', {
            scrollDirection: 'up',
        })
        if (
            (await this.elementIsDisplayed('E-CashClubAccordionButton')) ===
            false
        ) {
            throw new Error(
                `Failed - E-Cash Club accordion is not in the account settings`,
            )
        }
        await this.clickElementByKey('Leave Federation')
        await this.acceptAlert('Yes')
        if (
            (await this.elementIsDisplayed('E-CashClubAccordionButton')) ===
            true
        ) {
            throw new Error(
                `Failed - E-Cash Club accordion is in the account settings after leaving`,
            )
        }
        await this.clickElementByKey('HeaderCloseButton')
        await this.clickElementByKey('HomeHeaderHamburger')
        if ((await this.elementIsDisplayed('E-Cash Club', 2000)) === true) {
            throw new Error(
                `Failed - E-Cash Club Federation is still present in the Federations drawer after leaving`,
            )
        }
        // End of test - Leave a Federation without TOS - Same as with TOS - No difference
        await this.clickElementByKey('AddFederationButton')
        await this.clickElementByKey('E-CashClubJoinButton')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        await this.clickElementByKey('RecoverFromScratchSwitch')
        await this.clickElementByKey('JoinFederationButton')
        await this.clickElementByKey('E-CashClubSelectorButton')
        await this.waitForElementDisplayed('AddFederationButton')
        if ((await this.elementIsDisplayed('E-Cash Club', 2000)) === false) {
            throw new Error(
                `Failed - E-Cash Club Federation is not present in the Federations drawer after re-joining`,
            )
        }
        await this.clickOnText('Fedi Testnet', 0, true)
        // END of the process of re-joining to a Public Federation without TOS
    }
    catch(error: unknown) {
        console.error('Onboarding test failed:', error)
    }
}
