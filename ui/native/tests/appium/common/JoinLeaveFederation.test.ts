/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import {
    acceptCameraPermissionIfPresent,
    allowPasteIfPrompted,
} from '../fixtures/setupOnboardedLocalFed'

// E-Cash Club is the one pasteable federation the runner can reach: the
// suite's own list-joins prove it, while the other federations in
// meta-federations.json are external and their previews time out on CI.
const INVITE_PREVIEW_FEDERATION_NAME = 'E-Cash Club'

type PublicFederationMeta = {
    federation_name?: string
    invite_code?: string
}

function getPublicFederationInvite(federationName: string): string {
    const metaPath = path.resolve(
        __dirname,
        '../../../../web/public/meta-federations.json',
    )
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<
        string,
        PublicFederationMeta
    >
    const federation = Object.values(meta).find(
        f => f.federation_name === federationName,
    )
    if (!federation?.invite_code) {
        throw new Error(
            `No invite code found for public federation "${federationName}"`,
        )
    }
    return federation.invite_code
}

export class JoinLeaveFederation extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    static produces = ['onboarded', 'extraFederationsJoined'] as const

    // The app rejects leaving any federation while another federation is
    // still recovering (#3754), and re-joining a previously-left federation
    // kicks off a recovery whose duration depends on the federation's
    // blockchain scan, so a single leave attempt is not enough.
    private async leaveFederationViaAccordion(
        accordionKey: string,
        federationName: string,
    ): Promise<void> {
        const deadline = Date.now() + 120000
        while (Date.now() < deadline) {
            await this.clickElementByKey('Leave Federation')
            await this.acceptAlert('Yes')
            if (await this.waitForElementToDisappear(accordionKey, 10000)) {
                return
            }
            console.log(
                `Leaving ${federationName} was rejected, likely because a recovery is still in progress. Retrying...`,
            )
        }
        throw new Error(
            `Failed - ${federationName} accordion is in the account settings after leaving`,
        )
    }

    // Stops at the join preview on purpose: completing the join here would
    // turn the walk's later first-time E-Cash Club join into a recovery
    // rejoin. The join tap itself is covered by the list path, which lands
    // on this same screen.
    private async previewFederationByPastedInvite(
        invite: string,
        federationName: string,
    ): Promise<void> {
        await this.clickElementByKey('PlusButton')
        await this.clickElementByKey('joinTab')
        await acceptCameraPermissionIfPresent(this)
        await this.setClipboard(invite)
        await this.clickElementByKey('PasteButton')
        await allowPasteIfPrompted(this)
        await this.clickOnText('Continue', 0, true)
        await this.waitForElementDisplayed('JoinFederationButton', 45000)
        if (!(await this.isTextPresent(federationName, true, 5000))) {
            throw new Error(
                `Failed - pasted invite preview does not show "${federationName}"`,
            )
        }
        // The paste path pushes the join screen directly over the wallet,
        // so a single back lands home.
        await this.clickElementByKey('HeaderBackButton')
        await this.waitForElementDisplayed('PlusButton', 10000)
    }

    async execute(): Promise<void> {
        console.log('Starting Joining Public Federation Test')
        await this.clickElementByKey('WalletTabButton')
        await this.waitForElementDisplayed('FediTestnetDetailsButton', 2000)
        await this.previewFederationByPastedInvite(
            getPublicFederationInvite(INVITE_PREVIEW_FEDERATION_NAME),
            INVITE_PREVIEW_FEDERATION_NAME,
        )
        // END of the process of previewing a Federation by pasted invite code
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
        await this.leaveFederationViaAccordion(
            'BitcoinPrinciplesFedAccordionButton',
            'Bitcoin Principles',
        )
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
        await this.leaveFederationViaAccordion(
            'E-CashClubFedAccordionButton',
            'E-Cash Club',
        )
        await this.clickElementByKey('HeaderCloseButton')
        // await this.clickElementByKey('HomeHeaderHamburger') <-- no longer used
        await this.waitForElementDisplayed('PlusButton')
        if ((await this.scrollToElement('E-CashClubDetailsButton')) !== null) {
            throw new Error(
                `Failed - E-Cash Club Federation is still present in the Federations tab after leaving`,
            )
        }
        // End of test - Leave a Federation without TOS - Same as with TOS - No difference
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

        // Wallet switching: both federations are joined at this point, with
        // E-Cash Club active from the re-join. The switcher rows are selected
        // by visible name because their testIDs are keyed by federation id,
        // which is a runtime hash.
        await this.clickElementByKey('WalletTabButton')
        await this.openWalletSwitcher()
        await this.clickOnText('Fedi Testnet', 0, true)
        await this.waitForElementDisplayed('FediTestnetDetailsButton', 30000)
        if (await this.elementIsDisplayed('E-CashClubDetailsButton', 2000)) {
            throw new Error(
                'E-Cash Club remained selected after switching to Fedi Testnet',
            )
        }

        await this.openWalletSwitcher()
        await this.clickOnText('E-Cash Club', 0, true)
        await this.waitForElementDisplayed('E-CashClubDetailsButton', 30000)
        if (await this.elementIsDisplayed('FediTestnetDetailsButton', 2000)) {
            throw new Error(
                'Fedi Testnet remained selected after switching to E-Cash Club',
            )
        }
        await this.clickElementByKey('HomeTabButton')
        // END of the process of switching the active wallet between federations
    }

    // Tapping the wallet tab while it is focused opens the switcher overlay
    // instead of navigating.
    private async openWalletSwitcher(): Promise<void> {
        await this.clickElementByKey('WalletTabButton')
        await this.waitForText('Select Wallet Service', 0, true, 10000)
    }

    catch(error: unknown) {
        console.error('Onboarding test failed:', error)
    }
}
