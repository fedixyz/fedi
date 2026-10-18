/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { setupOnboardedLocalFed } from '../fixtures/setupOnboardedLocalFed'
import {
    createGroupAndCaptureRoomId,
    Group,
    knockOnRoom,
    openRoomByName,
    respondToOnlyKnock,
    switchToChatTab,
} from './chatGroups'
import {
    generateDevfedEcash,
    getDevfedInvite,
    reverseDevfedPortsIntoDevices,
} from './devfed'
import {
    assertBackupReminderAction,
    depositToStableBalance,
    enterAmount,
    enterFiatAmount,
    readWalletSats,
    redeemEcash,
    switchWalletTo,
} from './wallet'

// RoomSettings only shows the multispend menu row on a private, non-broadcast
// group, so the group is private and bob joins it by knocking.
const MULTISPEND_GROUP: Group = {
    name: 'E2E Multispend Group',
    message: 'multispend group seed message',
    isPublic: false,
    broadcastOnly: false,
}

// A room keeps showing its stable group once it has one, so the bitcoin group
// gets a room of its own.
const BTC_MULTISPEND_GROUP: Group = {
    name: 'E2E Bitcoin Multispend Group',
    message: 'bitcoin multispend group seed message',
    isPublic: false,
    broadcastOnly: false,
}

const BOB_NAME = 'msbob'
const FUND_SATS = 500_000
const STABILIZE_USD = 3
const GROUP_DEPOSIT_USD = 2
const WITHDRAW_USD = 1
// the dev fed refuses bitcoin deposits and withdrawals under 100 sats
const BTC_GROUP_DEPOSIT_SATS = 20_000
const BTC_WITHDRAW_SATS = 5_000
// the payout sweep into the wallet costs under 1,000 sats
const BTC_SWEEP_FEE_CAP_SATS = 1_000

// The stability pool settles deposits and multispend transfers on its cycle
// cadence, which stretches under CI load.
const SETTLE_TIMEOUT = 180_000

const formatSats = (sats: number): string => sats.toLocaleString('en-US')

export class Multispend extends AppiumTestBase {
    static prerequisites = [] as const
    // None of these have fixtures; declaring them makes the runner reset to a
    // fresh account after this test, so a later test never inherits the funded
    // wallet, the runtime federation, or the created rooms.
    static produces = ['onboarded', 'walletUsed', 'chatRoomsCreated'] as const
    static actors = 2

    async execute(): Promise<void> {
        console.log('Starting Multispend test')

        // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
        const alice: AppiumTestBase = this
        const bob = await this.spawnActor('b')

        // Phase 0: both actors join the same local fed; bob takes a fixed name.
        console.log('[phase0] join local fed')
        await reverseDevfedPortsIntoDevices()
        const invite = await getDevfedInvite()
        await setupOnboardedLocalFed(alice, invite)
        await setupOnboardedLocalFed(bob, invite)
        await setDisplayName(bob, BOB_NAME)

        // Phase 1: alice creates a private group, bob knocks, alice admits him.
        console.log('[phase1] create the group and admit bob')
        await switchToChatTab(alice)
        const roomId = await createGroupAndCaptureRoomId(
            alice,
            MULTISPEND_GROUP,
        )
        await knockOnRoom(bob, roomId)
        await openRoomByName(alice, MULTISPEND_GROUP.name)
        await respondToOnlyKnock(alice, 'accept')

        // Phase 2: alice proposes a multispend, both members as voters,
        // threshold 2.
        console.log('[phase2] alice creates the multispend')
        await openRoomByName(alice, MULTISPEND_GROUP.name)
        await openMultispendFromRoom(alice)
        await alice.waitForElementDisplayed(
            'CreateMultispendButton',
            MATRIX_TIMEOUT,
        )
        await alice.clickElementByKey('CreateMultispendButton')
        await alice.waitForElementDisplayed(
            'MultispendKindOption-fiat-check',
            MATRIX_TIMEOUT,
        )
        await alice.saveScreenshot('multispend-fiat-create')
        await assignBobAndSubmit(alice)

        // Phase 3: bob reviews and accepts; the group finalizes once every
        // invited voter accepts.
        console.log('[phase3] bob accepts the invitation')
        await openRoomByName(bob, MULTISPEND_GROUP.name)
        await bob.clickOnText('Review', 0, true, MATRIX_TIMEOUT)
        await bob.clickOnText('Accept', 0, true, MATRIX_TIMEOUT)
        await bob.waitForText('Deposit', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('Active', 0, false, MATRIX_TIMEOUT)
        // the balance currency only renders on the group wallet header
        await openMultispendFromRoom(alice)
        await alice.waitForText('Deposit', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('USD', 0, true, MATRIX_TIMEOUT)
        await alice.saveScreenshot('multispend-fiat-active')
        await backOutOfMultispend(alice)

        // Phase 4: fund alice from the faucet, move funds into her stable
        // balance, deposit into the group.
        console.log('[phase4] fund, stabilize, deposit into the group')
        const fundEcash = await generateDevfedEcash(FUND_SATS * 1000)
        // phase 3 leaves alice in the room; redeemEcash starts from the main
        // tab bar, so return her home first
        await alice.clickElementByKey('HeaderBackButton')
        await alice.clickElementByKey('HomeTabButton')
        await redeemEcash(alice, fundEcash)
        await alice.waitForText('Ecash claimed', 0, true, 120000)
        await alice.clickOnText('Go to wallet', 0, true)
        await assertBackupReminderAction(alice)
        await depositToStableBalance(alice, STABILIZE_USD)

        await openRoomByName(alice, MULTISPEND_GROUP.name)
        await openMultispendFromRoom(alice)
        await alice.waitForText('Deposit', 0, true, MATRIX_TIMEOUT)
        await alice.clickOnText('Deposit', 0, true)
        await enterFiatAmount(alice, GROUP_DEPOSIT_USD)
        await alice.clickOnText('Deposit', 0, true)
        await alice.waitForText('Confirm', 0, true, 30000)
        await alice.saveScreenshot('multispend-fiat-deposit-confirm')
        await alice.clickOnText('Confirm', 0, true, 30000)
        // bob observes the deposit event from the room timeline, so pop him off
        // the group wallet back to the conversation first.
        await backOutOfMultispend(bob)
        await bob.waitForText('has deposited', 0, false, SETTLE_TIMEOUT)
        await bob.saveScreenshot('multispend-fiat-deposit-event')

        // Phase 5: alice requests a withdrawal; both voters approve it and it
        // runs to completion.
        console.log('[phase5] withdraw with both approvals')
        await alice.waitForText('Withdraw', 0, true, MATRIX_TIMEOUT)
        await alice.clickOnText('Withdraw', 0, true)
        await enterFiatAmount(alice, WITHDRAW_USD)
        await saveWithdrawalNote(alice, 'e2e withdrawal')
        await alice.clickOnText('Withdraw', 0, true)
        await alice.clickOnText('Confirm', 0, true, 30000)

        await approveOnlyWithdrawalRequest(alice)
        // bob is still in the room from phase 4, so open the wallet directly;
        // re-navigating would tap the chat tab, which the room screen hides
        await openMultispendFromRoom(bob)
        await approveOnlyWithdrawalRequest(bob)

        await waitForRequestStatus(bob, 'Complete')
        await bob.saveScreenshot('multispend-fiat-request-complete')
        console.log('[phase5] withdrawal completed')

        // Phase 6: a second private group for the bitcoin pool.
        console.log('[phase6] create the bitcoin group and admit bob')
        await backOutOfMultispend(alice)
        await alice.clickElementByKey('HeaderBackButton')
        await switchToChatTab(alice)
        const btcRoomId = await createGroupAndCaptureRoomId(
            alice,
            BTC_MULTISPEND_GROUP,
        )
        // the knock screen pops back to where bob was, and the room tile tap
        // needs the tab bar, which the group wallet hides
        await backOutOfMultispend(bob)
        await bob.clickElementByKey('HeaderBackButton')
        await knockOnRoom(bob, btcRoomId)
        await openRoomByName(alice, BTC_MULTISPEND_GROUP.name)
        await respondToOnlyKnock(alice, 'accept')

        // Phase 7: alice picks the bitcoin balance type. The picker needs the
        // btc_multispend flag, which the staging feature payload turns on for
        // dev builds.
        console.log('[phase7] alice creates the bitcoin multispend')
        await openRoomByName(alice, BTC_MULTISPEND_GROUP.name)
        await openMultispendFromRoom(alice)
        // the intro screen shows once per install, so the second room lands
        // on the create screen directly
        await alice.waitForElementDisplayed(
            'MultispendKindOption-btc',
            MATRIX_TIMEOUT,
        )
        await alice.clickElementByKey('MultispendKindOption-btc')
        await alice.waitForElementDisplayed('MultispendKindOption-btc-check')
        await alice.saveScreenshot('multispend-btc-kind-picker')
        await assignBobAndSubmit(alice)
        await alice.saveScreenshot('multispend-btc-invitation-pending')

        // Phase 8: bob accepts the bitcoin invitation.
        console.log('[phase8] bob accepts the bitcoin invitation')
        await openRoomByName(bob, BTC_MULTISPEND_GROUP.name)
        await bob.waitForText('Balance Type: Bitcoin', 0, false, MATRIX_TIMEOUT)
        await bob.saveScreenshot('multispend-btc-invitation-event')
        await bob.clickOnText('Review', 0, true, MATRIX_TIMEOUT)
        await bob.clickOnText('Accept', 0, true, MATRIX_TIMEOUT)
        await bob.waitForText('Deposit', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('Active', 0, false, MATRIX_TIMEOUT)
        await openMultispendFromRoom(alice)
        await alice.waitForText('Deposit', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('SATS', 0, true, MATRIX_TIMEOUT)
        await alice.saveScreenshot('multispend-btc-active')

        // Phase 9: alice deposits sats from her bitcoin balance.
        console.log('[phase9] deposit sats into the bitcoin group')
        await alice.clickOnText('Deposit', 0, true, MATRIX_TIMEOUT)
        await alice.waitForElementDisplayed('AmountInputLabel')
        await assertSatsLocked(alice)
        await enterAmount(alice, BTC_GROUP_DEPOSIT_SATS)
        await alice.clickOnText('Deposit', 0, true)
        await alice.waitForText(
            `${formatSats(BTC_GROUP_DEPOSIT_SATS)} SATS`,
            0,
            false,
            30000,
        )
        await alice.saveScreenshot('multispend-btc-deposit-confirm')
        await alice.clickOnText('Confirm', 0, true, 30000)
        await backOutOfMultispend(bob)
        await bob.waitForText('has deposited', 0, false, SETTLE_TIMEOUT)
        await bob.waitForText(
            `${formatSats(BTC_GROUP_DEPOSIT_SATS)} SATS`,
            0,
            false,
            SETTLE_TIMEOUT,
        )
        await bob.saveScreenshot('multispend-btc-deposit-event')
        await alice.waitForText(
            formatSats(BTC_GROUP_DEPOSIT_SATS),
            0,
            true,
            SETTLE_TIMEOUT,
        )
        await alice.saveScreenshot('multispend-btc-wallet-funded')

        // Phase 10: a sats withdrawal with both approvals pays alice's wallet.
        console.log('[phase10] withdraw sats with both approvals')
        const walletBeforePayout = await readAliceWalletSats(alice)
        await openRoomByName(alice, BTC_MULTISPEND_GROUP.name)
        await openMultispendFromRoom(alice)
        await alice.waitForText('Withdraw', 0, true, MATRIX_TIMEOUT)
        await alice.clickOnText('Withdraw', 0, true)
        await alice.waitForElementDisplayed('AmountInputLabel')
        await assertSatsLocked(alice)
        await enterAmount(alice, BTC_WITHDRAW_SATS)
        await saveWithdrawalNote(alice, 'e2e bitcoin withdrawal')
        await alice.clickOnText('Withdraw', 0, true)
        await alice.waitForText(
            `${formatSats(BTC_WITHDRAW_SATS)} SATS`,
            0,
            false,
            30000,
        )
        await alice.saveScreenshot('multispend-btc-withdraw-confirm')
        await alice.clickOnText('Confirm', 0, true, 30000)

        await approveOnlyWithdrawalRequest(alice)
        await openMultispendFromRoom(bob)
        await approveOnlyWithdrawalRequest(bob)

        await waitForRequestStatus(bob, 'Complete')
        await bob.saveScreenshot('multispend-btc-request-complete')
        await alice.waitForText(
            formatSats(BTC_GROUP_DEPOSIT_SATS - BTC_WITHDRAW_SATS),
            0,
            true,
            SETTLE_TIMEOUT,
        )
        await alice.saveScreenshot('multispend-btc-wallet-after-withdrawal')

        const walletAfterPayout = await waitForWalletGain(
            alice,
            walletBeforePayout,
            BTC_WITHDRAW_SATS,
        )
        console.log(
            `[phase10] wallet went from ${walletBeforePayout} to ${walletAfterPayout} sats`,
        )
        await alice.saveScreenshot('multispend-btc-wallet-after-payout')
    }
}

async function setDisplayName(
    t: AppiumTestBase,
    displayName: string,
): Promise<void> {
    await t.clickElementByKey('HomeTabButton')
    await t.clickElementByKey('AvatarButton')
    await t.waitForElementDisplayed('UserQrContainer')
    await t.scrollToElement('Edit profile', { scrollDirection: 'up' })
    await t.clickElementByKey('Edit profile')
    await t.waitForElementDisplayed('DisplayNameInput')
    await t.typeIntoElementByKey('DisplayNameInput', displayName)
    await t.dismissKeyboard()
    await t.clickOnText('Save', 0, true)
    await t.waitForElementDisplayed('UserQrContainer')
    await t.clickElementByKey('HeaderCloseButton')
    await t.clickElementByKey('HomeTabButton')
}

async function openMultispendFromRoom(t: AppiumTestBase): Promise<void> {
    await t.clickElementByKey('ChatRoomSettingsButton')
    await t.clickOnText('Multispend', 0, true, MATRIX_TIMEOUT)
}

async function assignBobAndSubmit(t: AppiumTestBase): Promise<void> {
    await t.clickOnText('Assign Voters', 0, true)
    // bob's row appears once room membership syncs to alice
    await t.waitForText(BOB_NAME, 0, true, MATRIX_TIMEOUT)
    await t.clickOnText(BOB_NAME, 0, true)
    await t.clickOnText('Confirm', 0, true)
    await t.waitForElementDisplayed('MultispendThresholdInput')
    await t.typeIntoElementByKey('MultispendThresholdInput', '2')
    await t.dismissKeyboard()
    // iOS number-pad has no done key, so blur via a form label before the
    // submit tap, which would otherwise land on the keyboard
    await t.clickOnText('Approval Threshold', 0, true)
    await t.scrollToElement('MultispendSubmitButton')
    await t.clickElementByKey('MultispendSubmitButton')
    await t.waitForText('Waiting for approval', 0, false, MATRIX_TIMEOUT)
}

// a withdrawal is rejected without a purpose note; a deposit is not
async function saveWithdrawalNote(
    t: AppiumTestBase,
    note: string,
): Promise<void> {
    await t.clickElementByKey('NotesInputButton')
    await t.typeIntoElementByKey('EditNotesInput', note)
    await t.dismissKeyboard()
    await t.clickOnText('Save', 0, true)
}

async function assertSatsLocked(t: AppiumTestBase): Promise<void> {
    const label = await t.getTextByKey('AmountInputLabel')
    if (!label.toUpperCase().includes('SATS')) {
        throw new Error(`bitcoin group amount input is labelled "${label}"`)
    }
    if (await t.elementIsDisplayed('AmountUnitSwitcher', 1000)) {
        throw new Error('bitcoin group amount input still offers a unit switch')
    }
}

// call from inside a multispend wallet; ends on the bitcoin wallet tab
async function readAliceWalletSats(t: AppiumTestBase): Promise<number> {
    await backOutOfMultispend(t)
    await t.clickElementByKey('HeaderBackButton')
    await t.clickElementByKey('HomeTabButton')
    await switchWalletTo(t, 'bitcoin')
    return readWalletSats(t)
}

// the payout is swept into the wallet after the request completes, so poll
async function waitForWalletGain(
    t: AppiumTestBase,
    before: number,
    payoutSats: number,
): Promise<number> {
    await backOutOfMultispend(t)
    await t.clickElementByKey('HeaderBackButton')
    await t.clickElementByKey('HomeTabButton')
    await switchWalletTo(t, 'bitcoin')
    const deadline = Date.now() + SETTLE_TIMEOUT
    let after = before
    while (Date.now() < deadline) {
        after = await readWalletSats(t)
        const gained = after - before
        if (
            gained > payoutSats - BTC_SWEEP_FEE_CAP_SATS &&
            gained <= payoutSats
        ) {
            return after
        }
        await new Promise(r => setTimeout(r, 5000))
    }
    throw new Error(
        `wallet gained ${after - before} sats after a ${payoutSats} sat payout`,
    )
}

// The proposer's own request may already carry their signature, so their
// overlay shows no Approve button. Tap Approve only when it is present.
async function approveOnlyWithdrawalRequest(t: AppiumTestBase): Promise<void> {
    await t.waitForElementDisplayed(
        'MultispendWithdrawalRequestItem',
        MATRIX_TIMEOUT,
    )
    await t.clickElementByKey('MultispendWithdrawalRequestItem')
    await t.waitForText('Review Withdrawal request', 0, false, MATRIX_TIMEOUT)
    if (await t.isTextPresent('Approve', true, 5000)) {
        await t.clickOnText('Approve', 0, true, MATRIX_TIMEOUT)
    } else {
        try {
            await t.driver.back()
        } catch {
            /* overlay dismisses on the next navigation regardless */
        }
    }
    await new Promise(r => setTimeout(r, 1000))
}

// A slow refresh can lag the request status, so re-check on an interval until
// it lands.
async function waitForRequestStatus(
    t: AppiumTestBase,
    status: string,
): Promise<void> {
    const deadline = Date.now() + SETTLE_TIMEOUT
    while (Date.now() < deadline) {
        if (await t.isTextPresent(status, false, 5000)) return
        await new Promise(r => setTimeout(r, 5000))
    }
    throw new Error(`withdrawal request never reached status "${status}"`)
}

// the header back resets to the room on both platforms. a hardware back
// leaves the app once a deposit or withdrawal confirm has reset the stack.
async function backOutOfMultispend(t: AppiumTestBase): Promise<void> {
    await t.clickElementByKey('MultispendHeaderBackButton')
}
