/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { Platform, currentPlatform } from '../../configs/appium/types'
import { setupOnboarded } from '../fixtures/setupOnboarded'
import {
    ALL_GROUPS,
    BROADCAST_GROUP,
    createGroupAndCaptureRoomId,
    Group,
    knockOnRoom,
    KNOCKABLE_GROUPS,
    openRoomByName,
    PRIVATE_GROUP,
    PUBLIC_GROUP,
    respondToOnlyKnock,
    switchToChatTab,
} from './chatGroups'

export class Chat extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    // 'chatRoomsCreated' is a marker no other test consumes. Declaring it
    // makes the runner see leftover state after this test and reset to a
    // fresh onboarded account before the next one, so a later test never
    // inherits this account's created rooms (which breaks heavier flows
    // like backup-and-restore recovery).
    static produces = ['onboarded', 'chatRoomsCreated'] as const
    static actors = 2

    async execute(): Promise<void> {
        console.log('Starting Chat test')

        // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
        const alice: AppiumTestBase = this
        // Runner tears down secondary actors after the test (and
        // screenshots them on failure), so bob isn't disposed here.
        const bob = await this.spawnActor('b')

        // Runner only runs prerequisites on the primary actor; secondary
        // actors get their fixtures inline.
        await setupOnboarded.run(bob)

        // Phase 1: alice creates each group, sends a message, and
        // captures the room ID while still inside the room (avoids
        // re-finding the tile in the chat list, which is unreliable
        // cross-platform).
        await switchToChatTab(alice)
        const roomIds: Record<string, string> = {}
        for (const group of ALL_GROUPS) {
            roomIds[group.name] = await createGroupAndCaptureRoomId(
                alice,
                group,
            )
        }
        await switchToChatTab(alice)
        for (const group of ALL_GROUPS) {
            await verifyGroupInChatList(alice, group)
        }

        // Phase 1b guards the keyboard-up long press (see helper). Android
        // only: on iOS, Appium can't synthesize a long press that RN's
        // Pressable recognizes, so iOS stays manual QA; the fix is an RN list
        // prop the Android assertion guards. PUBLIC_GROUP is safe to dirty
        // here: later knock phases never reopen it.
        if (currentPlatform === Platform.ANDROID) {
            await assertKeyboardStaysOpenAfterSend(alice, PUBLIC_GROUP)
            await assertLongPressOpensActionsWithKeyboardUp(alice, PUBLIC_GROUP)
        }
        await assertPollCanBeCreatedAndVotedOn(alice, PUBLIC_GROUP)

        // Phase 2: bob knocks both private rooms.
        for (const group of KNOCKABLE_GROUPS) {
            await knockOnRoom(bob, roomIds[group.name])
        }
        await switchToChatTab(bob)
        for (const group of KNOCKABLE_GROUPS) {
            const tile = await bob.scrollToText(group.name, 0, false)
            if (!tile) {
                throw new Error(
                    `B's chat list missing pending knock for "${group.name}"`,
                )
            }
        }

        // Phase 3: alice accepts B in one room, declines B in the other.
        await openRoomByName(alice, PRIVATE_GROUP.name)
        await respondToOnlyKnock(alice, 'accept')
        await openRoomByName(alice, BROADCAST_GROUP.name)
        await respondToOnlyKnock(alice, 'decline')

        // Phase 4: verify B is joined to the admitted room (MessageInput
        // renders, so room is writeable), and B can re-knock the
        // declined room.
        await openRoomByName(bob, PRIVATE_GROUP.name)
        await bob.waitForElementDisplayed(
            'MessageInput-TextInput',
            MATRIX_TIMEOUT,
        )
        await bob.clickElementByKey('HeaderBackButton')
        await knockOnRoom(bob, roomIds[BROADCAST_GROUP.name])
    }
}

// iOS XCUITest exact-match doesn't reliably resolve chat tile text
// even when the tile is on-screen; partial match works on both
// platforms.
async function verifyGroupInChatList(
    t: AppiumTestBase,
    group: Group,
): Promise<void> {
    const tile = await t.scrollToText(group.name, 0, false)
    if (!tile) {
        throw new Error(`Failed - Group "${group.name}" not found in chat list`)
    }
    // The tile preview is a lazy summary that lags matrix sync; encrypted
    // (non-public) groups also need the latest event decrypted before the
    // text renders, which loses the default 20s window under CI load.
    const preview = await t.findElementByText(
        group.message,
        0,
        false,
        MATRIX_TIMEOUT,
    )
    if (!preview) {
        throw new Error(
            `Failed - Message preview for "${group.name}" not found. Expected: "${group.message}"`,
        )
    }
}

// With the composer focused (keyboard up / input focused), a long press on a
// message must still open its action menu. The conversation list sets
// keyboardShouldPersistTaps="handled" so the row receives the gesture; with the
// default 'never' the list swallows the first tap to dismiss the keyboard and
// the menu never appears.
async function assertLongPressOpensActionsWithKeyboardUp(
    t: AppiumTestBase,
    group: Group,
): Promise<void> {
    await openRoomByName(t, group.name)
    // Focus the composer so the keyboard-dismiss-on-tap path is active.
    await t.clickElementByKey('MessageInput-TextInput')
    await t.typeIntoElementByKey('MessageInput-TextInput', 'a')
    // Long-press the message sent on group creation.
    await t.longPressByText(group.message, 0, false)
    // The reply action only renders once the long press opens the menu.
    await t.waitForElementDisplayed('SelectedMessageOverlayReply')
    // Tapping reply closes the overlay; pop back to the chat list.
    await t.clickElementByKey('SelectedMessageOverlayReply')
    await t.clickElementByKey('HeaderBackButton')
}

// Guards the composer going disabled while a send is in flight, which drops
// the keyboard and never brings it back.
async function assertKeyboardStaysOpenAfterSend(
    t: AppiumTestBase,
    group: Group,
): Promise<void> {
    const message = 'Keyboard persistence message'
    await openRoomByName(t, group.name)
    await t.clickElementByKey('MessageInput-TextInput')
    await t.typeIntoElementByKey('MessageInput-TextInput', message)
    await t.waitForElementDisplayed('MessageInput-SendButton')
    // A device that never shows a soft keyboard would otherwise pass the real
    // assertion below for the wrong reason.
    if (!(await isKeyboardShown(t))) {
        throw new Error('Keyboard was not shown before sending a message')
    }
    await t.clickElementByKey('MessageInput-SendButton')
    // The composer only clears once the send resolves. Waiting on the message
    // text returns mid-send, since android's partial-text locator matches the
    // composer itself.
    await waitForComposerCleared(t, message)
    if (!(await waitForKeyboardShown(t, 5000))) {
        throw new Error('Keyboard was dismissed after sending a message')
    }
    await t.waitForText(message, 0, false, MATRIX_TIMEOUT)
    await t.clickElementByKey('HeaderBackButton')
}

async function assertPollCanBeCreatedAndVotedOn(
    t: AppiumTestBase,
    group: Group,
): Promise<void> {
    const question = 'Best e2e poll option?'
    const firstOption = 'Coffee'
    const secondOption = 'Tea'
    const thirdOption = 'Water'
    await openRoomByName(t, group.name)
    await t.clickElementByKey('MessageInput-PollButton')
    await t.waitForElementDisplayed('CreatePollQuestionInput')
    await t.typeIntoElementByKey('CreatePollQuestionInput', question)
    await t.typeIntoElementByKey('CreatePollOptionInput-0', firstOption)
    await t.typeIntoElementByKey('CreatePollOptionInput-1', secondOption)
    // The form opens with three option rows and only submits once every row
    // has text.
    await t.typeIntoElementByKey('CreatePollOptionInput-2', thirdOption)
    await t.dismissKeyboard()
    // iOS has no done key on this keyboard, so hideKeyboard is a no-op there
    // and the submit tap would land on the keyboard; a tap on the form's own
    // label blurs the input instead.
    await t.clickOnText('Options', 0, true)
    await t.scrollToElement('CreatePollSubmitButton')
    await t.clickElementByKey('CreatePollSubmitButton')
    // The question and options are also visible on the create form, so wait
    // for the timeline's vote control before asserting on them.
    await t.waitForElementDisplayed('ChatPollVoteButton', MATRIX_TIMEOUT)
    await t.waitForText(question, 0, true, MATRIX_TIMEOUT)
    await t.waitForText(firstOption, 0, true, MATRIX_TIMEOUT)
    await t.waitForText(secondOption, 0, true, MATRIX_TIMEOUT)
    await t.waitForText(thirdOption, 0, true, MATRIX_TIMEOUT)
    await t.clickOnText(firstOption, 0, true, MATRIX_TIMEOUT)
    await t.clickElementByKey('ChatPollVoteButton')
    await t.waitForText('100%', 0, true, MATRIX_TIMEOUT)
    await t.clickElementByKey('HeaderBackButton')
}

async function waitForComposerCleared(
    t: AppiumTestBase,
    message: string,
): Promise<void> {
    const deadline = Date.now() + MATRIX_TIMEOUT
    while (Date.now() < deadline) {
        const composer = await t.waitForElementDisplayed(
            'MessageInput-TextInput',
        )
        if (!(await composer.getText()).includes(message)) return
        await new Promise(r => setTimeout(r, 500))
    }
    throw new Error('Composer never cleared, so the message was never sent')
}

// A single sample can land on a re-render. Polling stays strict because the
// regression keeps the keyboard down for good.
async function waitForKeyboardShown(
    t: AppiumTestBase,
    timeout: number,
): Promise<boolean> {
    const deadline = Date.now() + timeout
    do {
        if (await isKeyboardShown(t)) return true
        await new Promise(r => setTimeout(r, 500))
    } while (Date.now() < deadline)
    return false
}

async function isKeyboardShown(t: AppiumTestBase): Promise<boolean> {
    return Boolean(await t.driver.executeScript('mobile: isKeyboardShown', []))
}
