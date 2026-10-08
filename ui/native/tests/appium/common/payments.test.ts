/* eslint-disable no-console */
import {
    generateOnchainTestEcash,
    getOnchainTestFederation,
    ONCHAIN_TEST_ADDRESS,
} from '@fedi/common/tests/utils/onchainTestFederation'

import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import {
    acceptCameraPermissionIfPresent,
    allowPasteIfPrompted,
    setupOnboardedLocalFed,
} from '../fixtures/setupOnboardedLocalFed'
import {
    generateDevfedEcash,
    getDevfedInvite,
    reverseDevfedPortsIntoDevices,
} from './devfed'
import {
    DEFAULT_FEDI_FEE_PPM,
    assertBackupReminderAction,
    assertFeeBreakdown,
    assertNewestTransaction,
    assertNewestTransactionNotesCanBeEdited,
    cancelNewestEcashSendFromHistory,
    dismissReceiveSuccess,
    dismissSendSuccess,
    ensureSatsMode,
    enterAmount,
    fediFeeSats,
    generateLightningInvoice,
    generateOnchainReceiveAddress,
    goToWallet,
    openFeeBreakdown,
    payLightningInvoiceByDeepLink,
    readWalletSats,
    redeemEcash,
    sendEcash,
    waitForWalletReceive,
} from './wallet'

// Funding is hermetic: a devimint regtest lightning federation runs on the host
// (launched by scripts/bridge/run-remote.sh --with-devfed wrapping the runner).
// The host's devimint client supplies funding, and the invite comes from the
// remote-server HTTP endpoint via REMOTE_BRIDGE_PORT. The fed binds to loopback,
// which an android emulator cannot see, so the test forwards its ports in with
// adb reverse (reverseDevfedPortsIntoDevices). ios simulators reach the host
// loopback directly and need no forwarding.

const FUND_SATS = 10000
const LN_P2P_SATS = 2000
const ECASH_SATS = 1000
const ECASH_CANCEL_SATS = 500
const ONCHAIN_SEND_SATS = 1000
const CHAT_PAYMENT_SATS = 500
const LN_P2P_FEE_SATS = fediFeeSats(LN_P2P_SATS, DEFAULT_FEDI_FEE_PPM.lightning)
const ECASH_FEE_SATS = fediFeeSats(ECASH_SATS, DEFAULT_FEDI_FEE_PPM.ecash)
const CHAT_PAYMENT_FEE_SATS = fediFeeSats(
    CHAT_PAYMENT_SATS,
    DEFAULT_FEDI_FEE_PPM.ecash,
)
const DIRECT_CHAT_MESSAGE = 'Direct chat setup for payment'
// bitcoin-address-validation accepts legacy testnet addresses, whose version
// bytes are also valid for regtest on-chain payments in the local dev fed.
const REGTEST_DESTINATION_ADDRESS = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'

export class Payments extends AppiumTestBase {
    // No registry prerequisites: a local fed's invite is only known at
    // runtime, so execute() onboards and joins each actor it uses.
    static prerequisites = [] as const
    // 'walletUsed' has no fixture; declaring it makes the runner reset to a
    // fresh account after this test so a later test never inherits a funded
    // wallet (or this test's runtime federation).
    static produces = ['onboarded', 'walletUsed'] as const
    static actors = 2

    async execute(): Promise<void> {
        console.log('Starting Payments test')
        const kind = await this.checkOnchainPayments()
        if (kind === 'two') return
        await this.resetAppToFresh()

        // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
        const alice: AppiumTestBase = this
        const bob = await this.spawnActor('b')

        // Phase 0: both actors onboard and join the same local federation.
        console.log('[phase0] join local fed')
        await reverseDevfedPortsIntoDevices()
        const invite = await getDevfedInvite()
        await setupOnboardedLocalFed(alice, invite)
        await setupOnboardedLocalFed(bob, invite)

        // Phase 1: fund alice with ecash minted from the dev-fed.
        console.log('[phase1] fund alice with dev-fed ecash')
        const fundEcash = await generateDevfedEcash(FUND_SATS * 1000)
        await redeemEcash(alice, fundEcash)
        await alice.waitForText('Ecash claimed', 0, true, 120000)
        await alice.clickOnText('Go to wallet', 0, true)
        await assertBackupReminderAction(alice)
        await waitForWalletReceive(alice)
        const aliceFunded = await readWalletSats(alice)
        if (aliceFunded !== FUND_SATS) {
            throw new Error(
                `alice has ${aliceFunded} sats after funding, expected ${FUND_SATS}`,
            )
        }
        await assertNewestTransaction(alice, {
            title: 'You received',
            type: 'ecash',
            statuses: ['Complete'],
            sats: FUND_SATS,
            feeSats: 0,
        })
        await assertNewestTransactionNotesCanBeEdited(alice, 'e2e funding note')
        console.log('[phase1] alice funded, history entry checked')

        // Phase 2: alice generates an on-chain receive address.
        console.log('[phase2] alice on-chain receive address')
        const onchainAddress = await generateOnchainReceiveAddress(alice)
        console.log(
            `[phase2] on-chain address copied (${onchainAddress.slice(0, 8)}...)`,
        )

        // Phase 3: alice -> bob over external lightning URI.
        console.log('[phase3] alice -> bob external lightning URI')
        const bobInvoice = await generateLightningInvoice(bob, LN_P2P_SATS)
        await payLightningInvoiceByDeepLink(alice, bobInvoice, LN_P2P_SATS)
        await alice.waitForText('You sent', 0, true, 60000)
        await bob.waitForText('You received', 0, true, 120000)
        await dismissSendSuccess(alice)
        await dismissReceiveSuccess(bob)
        await assertNewestTransaction(alice, {
            title: 'You sent',
            type: 'Lightning',
            statuses: ['Sent'],
            sats: LN_P2P_SATS,
            feeSats: LN_P2P_FEE_SATS,
        })
        await assertNewestTransaction(bob, {
            title: 'You received',
            type: 'Lightning',
            statuses: ['Received'],
            sats: LN_P2P_SATS,
            feeSats: 0,
        })
        console.log(
            '[phase3] external lightning URI transfer confirmed on both devices',
        )

        // Phase 4: bob -> alice over ecash (offline send + claim).
        console.log('[phase4] bob -> alice ecash')
        const ecashToken = await sendEcash(bob, ECASH_SATS)
        await redeemEcash(alice, ecashToken)
        await alice.waitForText('Ecash claimed', 0, true, 60000)
        await alice.clickOnText('Go to wallet', 0, true)
        await waitForWalletReceive(alice)
        // Sent 2000 over lightning, received 1000 back as ecash, so alice's
        // balance must have moved below what she was funded with.
        const aliceFinal = await readWalletSats(alice)
        if (aliceFinal >= aliceFunded) {
            throw new Error(
                `alice balance ${aliceFinal} should be below the funded ${aliceFunded} after the transfers`,
            )
        }
        await assertNewestTransaction(alice, {
            title: 'You received',
            type: 'ecash',
            statuses: ['Complete'],
            sats: ECASH_SATS,
            feeSats: 0,
        })
        // Bob is still on the ecash QR screen from sendEcash; the header
        // close returns straight to the tabs.
        await bob.clickElementByKey('HeaderCloseButton')
        await assertNewestTransaction(bob, {
            title: 'You sent',
            type: 'ecash',
            statuses: ['Sent'],
            sats: ECASH_SATS,
            feeSats: ECASH_FEE_SATS,
        })
        console.log('[phase4] ecash transfer confirmed')

        // Phase 5: alice sends bob an ecash chat payment.
        console.log('[phase5] alice -> bob chat payment')
        const bobUserLink = await readUserInviteLink(bob)
        await createDirectChat(alice, bobUserLink)
        await sendChatPayment(alice, CHAT_PAYMENT_SATS)
        await assertChatPaymentEvent(alice, 'You sent')
        // The room screen has no tab bar, so leave it before the wallet walk.
        await alice.clickElementByKey('HeaderBackButton')
        await assertNewestTransaction(alice, {
            title: 'You sent',
            type: 'ecash',
            statuses: ['Sent'],
            sats: CHAT_PAYMENT_SATS,
            feeSats: CHAT_PAYMENT_FEE_SATS,
        })
        console.log('[phase5] chat payment confirmed')

        // Phase 6: bob cancels an unclaimed ecash send from transaction history.
        console.log('[phase6] bob cancels unclaimed ecash from history')
        await sendEcash(bob, ECASH_CANCEL_SATS)
        await cancelNewestEcashSendFromHistory(bob, ECASH_CANCEL_SATS)
        console.log('[phase6] ecash cancellation confirmed')

        // Phase 7: alice pegs out on-chain to a static regtest address.
        console.log('[phase7] alice on-chain send')
        await alice.clickOnText('Send', 0, true)
        await acceptCameraPermissionIfPresent(alice)
        await alice.setClipboard(REGTEST_DESTINATION_ADDRESS)
        await alice.clickElementByKey('PasteButton')
        await allowPasteIfPrompted(alice)

        await ensureSatsMode(alice)
        await enterAmount(alice, ONCHAIN_SEND_SATS)
        await alice.clickOnText('Continue', 0, true)

        await alice.waitForElementDisplayed('OnchainSendDetailsButton', 30000)
        await alice.clickElementByKey('OnchainSendDetailsButton')
        for (const line of ['Send to', 'Fees', 'Send from']) {
            if (!(await alice.isTextPresent(line, true, 5000))) {
                throw new Error(
                    `on-chain confirmation details missing "${line}"`,
                )
            }
        }
        await openFeeBreakdown(alice)
        await assertFeeBreakdown(alice, {
            'Fedi fee': fediFeeSats(
                ONCHAIN_SEND_SATS,
                DEFAULT_FEDI_FEE_PPM.onchain,
            ),
            'Federation fee': 0,
        })
        await alice.clickElementByKey('fee-breakdown-close')

        await alice.clickElementByKey('SendConfirmButton')
        await alice.waitForText('You sent', 0, true, 120000)
        // The success screen groups thousands (accounting.formatNumber), so
        // 1000 renders as "1,000 SATS".
        await alice.waitForText(
            `${ONCHAIN_SEND_SATS.toLocaleString('en-US')} SATS`,
            0,
            true,
            5000,
        )
        await dismissSendSuccess(alice)

        const afterOnchain = await readWalletSats(alice)
        if (afterOnchain >= aliceFinal) {
            throw new Error(
                `alice balance ${afterOnchain} should be below ${aliceFinal} after the on-chain send`,
            )
        }
        await assertNewestTransaction(alice, {
            title: 'You sent',
            type: 'On-chain',
            statuses: ['Sent', 'Pending'],
            sats: ONCHAIN_SEND_SATS,
        })
        console.log('[phase7] on-chain send confirmed')
    }

    private async checkOnchainPayments(): Promise<'one' | 'two'> {
        const { kind, minimum } = getOnchainTestFederation()
        const minimumMessage = `The minimum you can send is ${minimum.toLocaleString('en-US')} sats`
        console.log(`[payments:onchain] kind=${kind}, minimum=${minimum}`)
        await reverseDevfedPortsIntoDevices()
        await setupOnboardedLocalFed(this, await getDevfedInvite())
        await goToWallet(this)
        await this.assertBalance(0)

        await this.openOnchainAmount(ONCHAIN_TEST_ADDRESS, true)
        await this.assertAmount(0)
        if (await this.elementIsDisplayed('amount-input-error', 1000)) {
            throw new Error('Zero amount shows an error before submission')
        }
        await this.assertBlocked(minimumMessage)
        await this.replaceAmount(100000)
        await this.assertBlocked(minimumMessage)
        await this.leaveOnchainAmount(true)
        await this.assertBalance(0)
        console.log(
            '[payments:onchain] zero balance: submit feedback and blocked navigation passed',
        )

        await this.fundOnchainWallet(generateOnchainTestEcash(583))
        let lowBalance = 0
        await this.driver.waitUntil(
            async () => {
                lowBalance = await readWalletSats(this)
                return lowBalance >= 581 && lowBalance <= 583
            },
            { timeout: 120000, timeoutMsg: 'Expected about 583 sats' },
        )
        await this.openOnchainAmount()
        for (const amount of [1, 583, 5836, 10000, 100000]) {
            await this.replaceAmount(amount)
            await this.assertMinimum(minimumMessage)
            await this.clickOnText(minimumMessage, 0, true)
            await this.assertAmount(amount)
            await this.assertBlocked(minimumMessage)
            await this.assertAmount(amount)
            console.log(
                `[payments:onchain] balance=${lowBalance}, typed=${amount}: minimum retained, suggestion inert, navigation blocked`,
            )
        }
        await this.saveScreenshot(`payments-onchain-${kind}-unaffordable`)
        await this.clickElementByKey('AmountUnitSwitcher')
        await this.driver.waitUntil(
            async () =>
                (await this.getTextByKey('AmountInputLabel')).toUpperCase() ===
                'USD',
            { timeout: 5000, timeoutMsg: 'Amount input did not switch to USD' },
        )
        await this.replaceAmount(1)
        await this.assertMinimum(minimumMessage)
        const fiatBefore = await this.getTextByKey('AmountInputValue')
        await this.clickOnText(minimumMessage, 0, true)
        if ((await this.getTextByKey('AmountInputValue')) !== fiatBefore) {
            throw new Error('Unaffordable suggestion changed the fiat input')
        }
        await this.assertBlocked(minimumMessage)
        if ((await this.getTextByKey('AmountInputValue')) !== fiatBefore) {
            throw new Error('Blocked submission changed the fiat input')
        }
        await this.saveScreenshot(`payments-onchain-${kind}-fiat`)
        await ensureSatsMode(this)
        await this.leaveOnchainAmount()
        await this.assertBalance(lowBalance)

        await this.openOnchainAmount(
            `bitcoin:${ONCHAIN_TEST_ADDRESS}?amount=0.001`,
        )
        await this.assertAmount(100000)
        await this.assertMinimum(minimumMessage)
        await this.clickOnText(minimumMessage, 0, true)
        await this.assertAmount(100000)
        if (await this.elementIsDisplayed('NumpadButton-1', 1000)) {
            throw new Error('Fixed BIP21 request unexpectedly has a keypad')
        }
        await this.assertBlocked(minimumMessage)
        await this.assertAmount(100000)
        await this.leaveOnchainAmount()
        await this.assertBalance(lowBalance)
        console.log(
            '[payments:onchain] fiat and fixed BIP21 requests passed; balance unchanged',
        )

        await this.fundOnchainWallet(
            generateOnchainTestEcash(100000, 'atLeast'),
        )
        let fundedBalance = 0
        await this.driver.waitUntil(
            async () => {
                fundedBalance = await readWalletSats(this)
                return fundedBalance >= 99000
            },
            { timeout: 120000, timeoutMsg: 'Funded wallet balance is too low' },
        )
        await this.openOnchainAmount()
        await this.replaceAmount(minimum - 1)
        await this.waitForText(minimumMessage, 0, true, 30000)
        await this.clickOnText(minimumMessage, 0, true)
        await this.assertAmount(minimum)
        if (await this.elementIsDisplayed('amount-input-error', 1000)) {
            throw new Error(
                'Affordable minimum suggestion did not clear the error',
            )
        }
        await this.clickOnText('Continue', 0, true)
        await this.waitForElementDisplayed('OnchainSendDetailsButton', 30000)
        await this.clickElementByKey('HeaderBackButton')

        await this.replaceAmount(fundedBalance + 100000)
        await this.waitForElementDisplayed('amount-input-error')
        let maxMessage = ''
        let maximum = NaN
        await this.driver.waitUntil(
            async () => {
                maxMessage = await this.getTextByKey('amount-input-error')
                const match = maxMessage.match(
                    /^The max you can send is ([\d,]+) sats$/i,
                )
                maximum = match ? Number(match[1].replace(/,/g, '')) : NaN
                return maximum >= minimum && maximum < fundedBalance
            },
            { timeout: 30000, timeoutMsg: 'Expected a fee-adjusted maximum' },
        )
        await this.clickOnText(maxMessage, 0, true)
        await this.assertAmount(maximum)
        if (await this.elementIsDisplayed('amount-input-error', 1000)) {
            throw new Error(
                'Affordable maximum suggestion did not clear the error',
            )
        }
        await this.clickOnText('Continue', 0, true)
        await this.waitForElementDisplayed('OnchainSendDetailsButton', 30000)
        await this.saveScreenshot(
            `payments-onchain-${kind}-funded-confirmation`,
        )
        await this.clickElementByKey('HeaderBackButton')
        await this.leaveOnchainAmount()
        await this.assertBalance(fundedBalance)
        console.log(
            `[payments:onchain] funded: minimum ${minimum} and maximum ${maximum} suggestions reached confirmation; balance unchanged`,
        )
        return kind
    }

    private async openOnchainAmount(
        destination = ONCHAIN_TEST_ADDRESS,
        fromScanner = false,
    ) {
        await goToWallet(this)
        if (fromScanner) {
            await this.clickElementByKey('ScanTabButton')
        } else {
            await this.clickOnText('Send', 0, true)
        }
        await acceptCameraPermissionIfPresent(this)
        await this.setClipboard(destination)
        await this.clickElementByKey('PasteButton')
        await allowPasteIfPrompted(this)
        if (fromScanner) {
            await this.waitForText(
                'This is a bitcoin onchain payment, do you want to pay it?',
                0,
                true,
                30000,
            )
            await this.clickOnText('Continue', 0, true)
        }
        await this.waitForElementDisplayed('AmountInputValue', 30000)
        await ensureSatsMode(this)
    }

    private async leaveOnchainAmount(fromScanner = false) {
        await this.clickElementByKey('HeaderBackButton')
        if (!fromScanner) await this.clickElementByKey('HeaderBackButton')
        await goToWallet(this)
    }

    private async fundOnchainWallet(ecash: string) {
        await redeemEcash(this, ecash)
        await this.waitForText('Ecash claimed', 0, true, 120000)
        await this.clickOnText('Go to wallet', 0, true)
        await waitForWalletReceive(this)
    }

    private async assertBalance(expected: number) {
        const actual = await readWalletSats(this)
        if (actual !== expected) {
            throw new Error(
                `Balance changed: expected ${expected}, got ${actual}`,
            )
        }
    }

    private async assertAmount(expected: number) {
        await this.driver.waitUntil(
            async () =>
                Number(
                    (await this.getTextByKey('AmountInputValue')).replace(
                        /,/g,
                        '',
                    ),
                ) === expected,
            { timeout: 5000, timeoutMsg: `Amount did not remain ${expected}` },
        )
    }

    private async replaceAmount(amount: number) {
        const current = (await this.getTextByKey('AmountInputValue')).replace(
            /\D/g,
            '',
        )
        for (let i = 0; i < current.length + 3; i++) {
            await this.clickElementByKey('NumpadButton-backspace')
        }
        await this.assertAmount(0)
        await enterAmount(this, amount)
    }

    private async assertMinimum(message: string) {
        await this.waitForText(message, 0, true, 30000)
        const actual = await this.getTextByKey('amount-input-error')
        if (
            actual !== message ||
            (await this.isTextPresent('The max you can send', false, 500))
        ) {
            throw new Error(`Conflicting low-balance feedback: ${actual}`)
        }
    }

    private async assertBlocked(message: string) {
        await this.clickOnText('Continue', 0, true)
        await this.assertMinimum(message)
        if (await this.elementIsDisplayed('OnchainSendDetailsButton', 1000)) {
            throw new Error('Unaffordable amount reached confirmation')
        }
        await this.waitForElementDisplayed('AmountInputValue')
    }
}

async function readUserInviteLink(t: AppiumTestBase): Promise<string> {
    await t.clickElementByKey('HomeTabButton')
    await t.clickElementByKey('AvatarButton')
    await t.waitForElementDisplayed('TrueUsername', 60000)
    const userLink = (await t.getTextByKey('TrueUsername')).trim()
    if (!/screen=user/i.test(userLink)) {
        throw new Error(
            `profile QR text is not a user invite link: ${userLink}`,
        )
    }
    await t.clickElementByKey('HeaderCloseButton')
    return userLink
}

async function createDirectChat(
    t: AppiumTestBase,
    userLink: string,
): Promise<void> {
    await t.clickElementByKey('ChatTabButton')
    await t.waitForElementDisplayed('SearchButton')
    await t.clickElementByKey('PlusButton')
    await t.clickOnText('Scan or paste', 0, true)
    await acceptCameraPermissionIfPresent(t)
    await t.setClipboard(userLink)
    await t.clickElementByKey('PasteButton')
    await allowPasteIfPrompted(t)
    await t.waitForElementDisplayed('MessageInput-TextInput', 60000)
    await t.typeIntoElementByKey('MessageInput-TextInput', DIRECT_CHAT_MESSAGE)
    await t.waitForElementDisplayed('MessageInput-SendButton')
    await t.clickElementByKey('MessageInput-SendButton')
    // The first chat message raises the iOS notification permission prompt,
    // which swallows every tap until it is answered and outlives an app reset.
    await t.acceptIosNotificationPromptIfPresent()
    await t.waitForElementDisplayed('ChatWalletButton', 120000)
}

async function sendChatPayment(t: AppiumTestBase, sats: number): Promise<void> {
    await t.clickElementByKey('ChatWalletButton')
    await ensureSatsMode(t)
    await enterAmount(t, sats)
    await t.clickOnText('Send', 0, true)
    await t.waitForText('Total', 0, true, 30000)
    await t.clickOnText('Send', 0, true)
}

async function assertChatPaymentEvent(
    t: AppiumTestBase,
    paymentText: string,
): Promise<void> {
    await t.waitForText(paymentText, 0, false, 120000)
    // At-least note selection can overspend by a sat or two, so 500 sats can
    // read as 501 here; the amount is asserted with a fee margin on the
    // transaction history entry instead.
    await t.waitForText('SATS)', 0, false, 5000)
}
