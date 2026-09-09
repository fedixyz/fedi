/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'
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
    enterFiatAmount,
    redeemEcash,
} from './wallet'

// RoomSettings only shows the multispend menu row on a private, non-broadcast
// group, so the group is private and bob joins it by knocking.
const MULTISPEND_GROUP: Group = {
    name: 'E2E Multispend Group',
    message: 'multispend group seed message',
    isPublic: false,
    broadcastOnly: false,
}

const BOB_NAME = 'msbob'
const FUND_SATS = 500_000
const STABILIZE_USD = 3
const GROUP_DEPOSIT_USD = 2
const WITHDRAW_USD = 1

// The stability pool settles deposits and multispend transfers on its cycle
// cadence, which stretches under CI load.
const SETTLE_TIMEOUT = 180_000

export class Multispend extends AppiumTestBase {
    static prerequisites = [] as const
    // None of these have fixtures; declaring them makes the runner reset to a
    // fresh account after this test, so a later test never inherits the funded
    // wallet, the runtime federation, or the created room.
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
        await alice.clickOnText('Assign Voters', 0, true)
        // bob's row appears once room membership syncs to alice
        await alice.waitForText(BOB_NAME, 0, true, MATRIX_TIMEOUT)
        await alice.clickOnText(BOB_NAME, 0, true)
        await alice.clickOnText('Confirm', 0, true)
        await alice.waitForElementDisplayed('MultispendThresholdInput')
        await alice.typeIntoElementByKey('MultispendThresholdInput', '2')
        await alice.dismissKeyboard()
        // iOS number-pad has no done key, so blur via a form label before the
        // submit tap, which would otherwise land on the keyboard
        await alice.clickOnText('Approval Threshold', 0, true)
        await alice.scrollToElement('MultispendSubmitButton')
        await alice.clickElementByKey('MultispendSubmitButton')
        await alice.waitForText(
            'Waiting for approval',
            0,
            false,
            MATRIX_TIMEOUT,
        )

        // Phase 3: bob reviews and accepts; the group finalizes once every
        // invited voter accepts.
        console.log('[phase3] bob accepts the invitation')
        await openRoomByName(bob, MULTISPEND_GROUP.name)
        await bob.clickOnText('Review', 0, true, MATRIX_TIMEOUT)
        await bob.clickOnText('Accept', 0, true, MATRIX_TIMEOUT)
        await bob.waitForText('Deposit', 0, true, MATRIX_TIMEOUT)
        await alice.waitForText('Active', 0, false, MATRIX_TIMEOUT)

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
        await alice.clickOnText('Confirm', 0, true, 30000)
        // bob observes the deposit event from the room timeline, so pop him off
        // the group wallet back to the conversation first.
        await backOutOfMultispend(bob)
        await bob.waitForText('has deposited', 0, false, SETTLE_TIMEOUT)

        // Phase 5: alice requests a withdrawal; both voters approve it and it
        // runs to completion.
        console.log('[phase5] withdraw with both approvals')
        await alice.waitForText('Withdraw', 0, true, MATRIX_TIMEOUT)
        await alice.clickOnText('Withdraw', 0, true)
        await enterFiatAmount(alice, WITHDRAW_USD)
        // a withdrawal is rejected without a purpose note; a deposit is not
        await alice.clickElementByKey('NotesInputButton')
        await alice.typeIntoElementByKey('EditNotesInput', 'e2e withdrawal')
        await alice.dismissKeyboard()
        await alice.clickOnText('Save', 0, true)
        await alice.clickOnText('Withdraw', 0, true)
        await alice.clickOnText('Confirm', 0, true, 30000)

        await approveOnlyWithdrawalRequest(alice)
        // bob is still in the room from phase 4, so open the wallet directly;
        // re-navigating would tap the chat tab, which the room screen hides
        await openMultispendFromRoom(bob)
        await approveOnlyWithdrawalRequest(bob)

        await waitForRequestStatus(bob, 'Complete')
        console.log('[phase5] withdrawal completed')
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

// Android hardware back works everywhere; iOS relies on the header testID.
async function backOutOfMultispend(t: AppiumTestBase): Promise<void> {
    if (currentPlatform === Platform.ANDROID) {
        await t.driver.back()
        return
    }
    await t.clickElementByKey('MultispendHeaderBackButton')
}
