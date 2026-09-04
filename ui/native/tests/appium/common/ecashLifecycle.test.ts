/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import { setupOnboardedLocalFed } from '../fixtures/setupOnboardedLocalFed'
import {
    generateDevfedEcash,
    getDevfedInvite,
    reverseDevfedPortsIntoDevices,
} from './devfed'
import {
    assertNewestTransaction,
    cancelEcashSend,
    goToWallet,
    readWalletSats,
    redeemEcash,
    sendEcash,
    waitForWalletReceive,
} from './wallet'

// What happens to ecash once it has left the sender: a cancel that beats the
// recipient, a cancel that loses to them, and a token replayed twice. The
// happy path of send-then-claim-once is covered by the payments test.

const FUND_SATS = 10000
const CANCELED_SATS = 1500
const CLAIMED_SATS = 1200

export class EcashLifecycle extends AppiumTestBase {
    // A local fed's invite only exists at runtime, so execute() joins both
    // actors itself.
    static prerequisites = [] as const
    static produces = ['onboarded', 'walletUsed'] as const
    static actors = 2

    async execute(): Promise<void> {
        console.log('Starting EcashLifecycle test')

        // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
        const alice: AppiumTestBase = this
        const bob = await this.spawnActor('b')

        console.log('[phase0] join local fed')
        await reverseDevfedPortsIntoDevices()
        const invite = await getDevfedInvite()
        await setupOnboardedLocalFed(alice, invite)
        await setupOnboardedLocalFed(bob, invite)

        console.log('[phase1] fund alice')
        await redeemEcash(alice, await generateDevfedEcash(FUND_SATS * 1000))
        await alice.waitForText('Ecash claimed', 0, true, 120000)
        await alice.clickOnText('Go to wallet', 0, true)
        await waitForWalletReceive(alice)
        // The dev fed mints with --allow-overpay, so a token is worth at least
        // what was asked for and often more. Later checks compare against what
        // actually landed rather than the figure requested.
        const funded = await readWalletSats(alice)
        if (funded < FUND_SATS) {
            throw new Error(
                `alice has ${funded} sats after funding, expected at least ${FUND_SATS}`,
            )
        }
        await goToWallet(bob)
        const bobOpening = await readWalletSats(bob)

        console.log('[phase2] cancel a send nobody claimed')
        await sendEcash(alice, CANCELED_SATS)
        await cancelEcashSend(alice)
        await alice.waitForText('Canceled Ecash Send', 0, true, 60000)
        // The cancel lands on a full-screen success view that covers the tab
        // bar, so the wallet is unreachable until it is dismissed.
        await alice.clickOnText('Done', 0, true)

        await goToWallet(alice)
        // Reissuing the notes costs a few sats, so the balance comes back just
        // under where it started rather than exactly on it. Bound it the way
        // the history assertion bounds a send.
        const cancelAllowance = Math.max(10, Math.ceil(CANCELED_SATS * 0.01))
        const afterCancel = await readWalletSats(alice)
        if (afterCancel < funded - cancelAllowance) {
            throw new Error(
                `alice has ${afterCancel} sats after canceling, expected within ${cancelAllowance} of the pre-send ${funded}`,
            )
        }
        // Canceling reissues the notes, so it lands as its own history entry.
        await assertNewestTransaction(alice, {
            title: 'Canceled Ecash Send',
            type: 'Canceled Ecash Send',
            statuses: ['Canceled'],
            sats: CANCELED_SATS,
        })

        // Alice stays on this QR screen until phase 4, which cancels this
        // exact send after bob has taken it. Don't navigate her away.
        console.log('[phase3] bob claims, then replays the same token')
        const token = await sendEcash(alice, CLAIMED_SATS)

        await redeemEcash(bob, token)
        await bob.waitForText('Ecash claimed', 0, true, 120000)
        await bob.clickOnText('Go to wallet', 0, true)
        await waitForWalletReceive(bob)
        const bobClaimed = await readWalletSats(bob)
        if (bobClaimed !== bobOpening + CLAIMED_SATS) {
            throw new Error(
                `bob has ${bobClaimed} sats after claiming, expected ${bobOpening + CLAIMED_SATS}`,
            )
        }

        // Replaying reaches the claim button, since parsing a token says
        // nothing about whether its notes are already spent.
        await redeemEcash(bob, token)
        if (await bob.isTextPresent('Ecash claimed', true, 15000)) {
            throw new Error('bob claimed the same ecash token twice')
        }
        await bob.waitForText('Failed to claim ecash', 0, true, 30000)
        await bob.clickElementByKey('HeaderBackButton')
        await goToWallet(bob)
        const bobReplayed = await readWalletSats(bob)
        if (bobReplayed !== bobClaimed) {
            throw new Error(
                `bob has ${bobReplayed} sats after a rejected replay, expected ${bobClaimed}`,
            )
        }

        console.log('[phase4] cancel a send bob already claimed')
        await cancelEcashSend(alice)
        // The cancel-failed code has no i18n mapping, so it surfaces a raw
        // bridge string. Assert on state, not on the toast.
        if (await alice.isTextPresent('Canceled Ecash Send', true, 15000)) {
            throw new Error(
                'a cancel that lost to the recipient reported success',
            )
        }
        await alice.clickElementByKey('HeaderCloseButton')

        await goToWallet(alice)
        const aliceFinal = await readWalletSats(alice)
        if (aliceFinal > funded - CLAIMED_SATS) {
            throw new Error(
                `alice has ${aliceFinal} sats after a failed cancel, expected at most ${funded - CLAIMED_SATS}. a cancel the recipient beat must not credit the sender`,
            )
        }
        // A cancel that lost the race leaves its own entry, so the send bob
        // took is not the newest row. Check the history still lists it as
        // Sent rather than assuming its position.
        await alice.clickElementByKey('BalanceCard__TransactionHistory')
        await alice.waitForElementDisplayed('transaction-item', 30000)
        if (!(await alice.isTextPresent('Sent', true, 15000))) {
            throw new Error(
                'the send bob claimed is no longer listed as Sent after the failed cancel',
            )
        }
        await alice.clickElementByKey('HeaderBackButton')
        console.log('[phase4] the failed cancel left the send at Sent')
    }

    catch(error: unknown) {
        console.error('Ecash lifecycle test failed:', error)
    }
}
