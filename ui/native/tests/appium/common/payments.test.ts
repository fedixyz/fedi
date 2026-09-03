/* eslint-disable no-console */
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
    assertBackupReminderAction,
    assertNewestTransaction,
    assertNewestTransactionNotesCanBeEdited,
    cancelNewestEcashSendFromHistory,
    dismissReceiveSuccess,
    dismissSendSuccess,
    ensureSatsMode,
    enterAmount,
    generateLightningInvoice,
    generateOnchainReceiveAddress,
    payLightningInvoiceByDeepLink,
    readWalletSats,
    redeemEcash,
    sendEcash,
    waitForWalletReceive,
} from './wallet'

// Funding is hermetic: a devimint regtest lightning federation runs on the host
// (launched by scripts/bridge/run-remote.sh --with-devfed wrapping the runner).
// The invite and minted ecash come from the remote-server HTTP endpoints on the
// host loopback via REMOTE_BRIDGE_PORT. The fed binds to the host loopback,
// which an android emulator cannot see, so the test forwards its ports in with
// adb reverse (reverseDevfedPortsIntoDevices). ios simulators reach the host
// loopback directly and need no forwarding.

const FUND_SATS = 10000
const LN_P2P_SATS = 2000
const ECASH_SATS = 1000
const ECASH_CANCEL_SATS = 500
const ONCHAIN_SEND_SATS = 1000
const CHAT_PAYMENT_SATS = 500
const DIRECT_CHAT_MESSAGE = 'Direct chat setup for payment'
// bitcoin-address-validation accepts legacy testnet addresses, whose version
// bytes are also valid for regtest on-chain payments in the local dev fed.
const REGTEST_DESTINATION_ADDRESS = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'

export class Payments extends AppiumTestBase {
    // No registry prerequisites: a local fed's invite is only known at
    // runtime, so execute() onboards and joins both actors itself.
    static prerequisites = [] as const
    // 'walletUsed' has no fixture; declaring it makes the runner reset to a
    // fresh account after this test so a later test never inherits a funded
    // wallet (or this test's runtime federation).
    static produces = ['onboarded', 'walletUsed'] as const
    static actors = 2

    async execute(): Promise<void> {
        console.log('Starting Payments test')

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
        await payLightningInvoiceByDeepLink(alice, bobInvoice)
        await alice.waitForText('You sent', 0, true, 60000)
        await bob.waitForText('You received', 0, true, 120000)
        await dismissSendSuccess(alice)
        await dismissReceiveSuccess(bob)
        await assertNewestTransaction(alice, {
            title: 'You sent',
            type: 'Lightning',
            statuses: ['Sent'],
            sats: LN_P2P_SATS,
        })
        await assertNewestTransaction(bob, {
            title: 'You received',
            type: 'Lightning',
            statuses: ['Received'],
            sats: LN_P2P_SATS,
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
        })
        // Bob is still on the ecash QR screen from sendEcash; the header
        // close returns straight to the tabs.
        await bob.clickElementByKey('HeaderCloseButton')
        await assertNewestTransaction(bob, {
            title: 'You sent',
            type: 'ecash',
            statuses: ['Sent'],
            sats: ECASH_SATS,
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
