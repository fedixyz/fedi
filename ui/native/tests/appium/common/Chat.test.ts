/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { setupOnboarded } from '../fixtures/setupOnboarded'

type Group = {
    name: string
    message: string
    isPublic: boolean
    broadcastOnly: boolean
}

const PRIVATE_GROUP: Group = {
    name: 'E2E Private Group',
    message: 'This is a private group message',
    isPublic: false,
    broadcastOnly: false,
}
const BROADCAST_GROUP: Group = {
    name: 'E2E Broadcast Group',
    message: 'This is a broadcast-only message',
    isPublic: false,
    broadcastOnly: true,
}
const PUBLIC_GROUP: Group = {
    name: 'E2E Public Group',
    message: 'This is a public group message',
    isPublic: true,
    broadcastOnly: false,
}
const PUBLIC_BROADCAST_GROUP: Group = {
    name: 'E2E Public Broadcast Group',
    message: 'This is a public broadcast message',
    isPublic: true,
    broadcastOnly: true,
}

const ALL_GROUPS: Group[] = [
    PRIVATE_GROUP,
    BROADCAST_GROUP,
    PUBLIC_GROUP,
    PUBLIC_BROADCAST_GROUP,
]
// Private rooms default to allowKnocking=true (mutex with isPublic),
// so both private groups are knockable; the public ones are not.
const KNOCKABLE_GROUPS: Group[] = [PRIVATE_GROUP, BROADCAST_GROUP]

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
            roomIds[group.name] = await createGroupAndSendMessage(alice, group)
        }
        await switchToChatTab(alice)
        for (const group of ALL_GROUPS) {
            await verifyGroupInChatList(alice, group)
        }

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

// Both Home and Chat headers reuse MainHeaderButtons, so the PlusButton
// testID is ambiguous mid-tab-switch and a tap can land on Home's
// "join community" handler instead of Chat's overlay. SearchButton is
// only rendered by ChatHeader, so waiting on it confirms the chat tab
// is actually mounted before any tap.
async function switchToChatTab(t: AppiumTestBase): Promise<void> {
    await t.clickElementByKey('ChatTabButton')
    await t.waitForElementDisplayed('SearchButton')
}

async function createGroupAndSendMessage(
    t: AppiumTestBase,
    group: Group,
): Promise<string> {
    console.log(`[${t.handle}] Creating group: ${group.name}`)
    await t.clickElementByKey('PlusButton')
    await t.clickOnText('Create a group', 0, true)
    await t.waitForElementDisplayed('GroupNameInput')
    await t.typeIntoElementByKey('GroupNameInput', group.name)
    if (group.broadcastOnly) await t.clickElementByKey('BroadcastOnlySwitch')
    if (group.isPublic) await t.clickElementByKey('PublicSwitch')
    await t.clickElementByKey('CreateGroupButton')
    try {
        await t.dismissAlert('Allow')
    } catch {
        /* no-op */
    }
    await t.waitForElementDisplayed('MessageInput-TextInput', MATRIX_TIMEOUT)
    await t.typeIntoElementByKey('MessageInput-TextInput', group.message)
    await t.waitForElementDisplayed('MessageInput-SendButton')
    await t.clickElementByKey('MessageInput-SendButton')
    const roomId = await captureRoomIdFromCurrentRoom(t)
    await t.clickElementByKey('HeaderBackButton')
    return roomId
}

async function captureRoomIdFromCurrentRoom(
    t: AppiumTestBase,
): Promise<string> {
    await t.clickElementByKey('ChatRoomSettingsButton')
    await t.clickOnText('Invite to group', 0, true, MATRIX_TIMEOUT)
    // the shared QR component tags its text element "TrueUsername" on every
    // screen it renders, including this invite screen, so that's the link here
    const linkEl = await t.waitForElementDisplayed(
        'TrueUsername',
        MATRIX_TIMEOUT,
    )
    // The invite screen renders one of two forms depending on the
    // share method: the universal link (`...?id={id}`) or the
    // `fedi:room:{id}:::` form. iOS getText also sometimes pulls in
    // sibling labels, so match a URL fragment rather than equality.
    const raw = await linkEl.getText()
    const match =
        raw.match(/[#?&]id=([^&\s]+)/) ||
        raw.match(/fedi(?::|:\/\/)room[:/](.+?)(?:::|$)/i)
    if (!match) {
        throw new Error(`Couldn't parse room id from "${raw}"`)
    }
    // Two back hops: invite -> RoomSettings -> conversation
    await t.clickElementByKey('HeaderBackButton')
    await t.clickElementByKey('HeaderBackButton')
    return decodeURIComponent(match[1])
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
    const preview = await t.findElementByText(group.message, 0, false)
    if (!preview) {
        throw new Error(
            `Failed - Message preview for "${group.name}" not found. Expected: "${group.message}"`,
        )
    }
}

async function openRoomByName(t: AppiumTestBase, name: string): Promise<void> {
    // Tap the chat tile via push navigation. Deep links route through
    // ConfirmJoinPublicGroup which dispatches resetToGroupChat; on iOS
    // the gear button onPress silently no-ops after that reset. Tile
    // tap arrives at ChatRoomConversation via push and keeps the gear
    // functional.
    await acceptIosNotificationPromptIfPresent(t)
    await t.clickElementByKey('ChatTabButton')
    await t.waitForElementDisplayed('SearchButton')
    await acceptIosNotificationPromptIfPresent(t)
    // testID derived from room title in ChatTile.tsx. Partial-text
    // scrolling on iOS resolved to the ScrollView root and the
    // default-child tap took the user to the wrong room.
    const tileKey = `ChatTile-${name}`
    await t.scrollToElement(tileKey)
    await t.clickElementByKey(tileKey)
    await t.waitForElementDisplayed('MessageInput-TextInput', MATRIX_TIMEOUT)
}

// NotificationContext triggers requestNotifications when chatList
// populates; the resulting Springboard prompt is owned by the OS (not
// the app), so it doesn't show up in element finders. Poll mobile:alert
// and tap the affirmative button.
async function acceptIosNotificationPromptIfPresent(
    t: AppiumTestBase,
    maxWaitMs = 20000,
): Promise<void> {
    const deadline = Date.now() + maxWaitMs
    while (Date.now() < deadline) {
        let buttons: string[] | null = null
        try {
            buttons = (await t.driver.executeScript('mobile: alert', [
                { action: 'getButtons' },
            ])) as string[]
        } catch {
            /* no alert at the moment; poll again shortly */
        }
        if (Array.isArray(buttons) && buttons.length > 0) {
            // Must anchor to start of label so "Don't Allow" is excluded:
            // buttons.find on `/allow/i` would match it first and tap
            // the wrong button.
            const allowLabel = buttons.find(b => /^(allow|ok)/i.test(b))
            if (allowLabel) {
                await t.driver.executeScript('mobile: alert', [
                    { action: 'accept', buttonLabel: allowLabel },
                ])
                // Settle for the dismiss animation before any subsequent
                // element query.
                await new Promise(r => setTimeout(r, 1500))
            }
            return
        }
        await new Promise(r => setTimeout(r, 500))
    }
}

async function knockOnRoom(t: AppiumTestBase, roomId: string): Promise<void> {
    // fedi:// scheme is registered directly in the manifest; the
    // https:// universal link path would require Android App Links
    // verification that emulators don't perform reliably.
    const url = `fedi://room/${encodeURIComponent(roomId)}`
    console.log(`[${t.handle}] Knocking via ${url}`)
    await t.openDeepLink(url)
    await t.waitForElementDisplayed(
        'ConfirmJoinPublicGroupScreen',
        MATRIX_TIMEOUT,
    )
    await t.clickElementByKey('ConfirmJoinButton')
    await t.waitForElementDisplayed('KnockPendingView', MATRIX_TIMEOUT)
    // KnockPendingView renders a "Go back" Button when invoked via
    // ConfirmJoinPublicGroup, which is the case here.
    await t.clickOnText('Go back', 0, true)
}

async function respondToOnlyKnock(
    t: AppiumTestBase,
    action: 'accept' | 'decline',
): Promise<void> {
    // The knocking member lags until matrix sync surfaces it, and
    // ChatRoomMembers refetches members on mount, so re-enter the screen
    // until the request appears on the Pending tab. Opening the members
    // row with an unviewed request lands on Pending; tap the tab
    // explicitly so the flow does not depend on that timing.
    const button =
        action === 'accept' ? 'KnockRequestAccept' : 'KnockRequestDecline'
    let handled = false
    for (let i = 0; i < 36 && !handled; i++) {
        await t.clickElementByKey('ChatRoomSettingsButton')
        await t.clickElementByKey('RoomMembersButton')
        await t.clickElementByKey('pendingTab')
        if (await t.elementIsDisplayed('KnockRequestTile', 3000)) {
            await t.clickElementByKey('KnockRequestTile')
            await t.waitForElementDisplayed(button)
            await t.clickElementByKey(button)
            handled = true
            break
        }
        await t.clickElementByKey('HeaderBackButton') // members -> settings
        await t.clickElementByKey('HeaderBackButton') // settings -> conversation
    }
    if (!handled) throw new Error('knock request never appeared')
    // Best-effort wait for the empty-state. Decline (kick) is the slow
    // path: matrix-rust-sdk only updates the local membership list after
    // the homeserver confirms the leave. Phase 4 verifies the actual
    // outcome from B's perspective, so a missing empty-state is not fatal.
    await t.elementIsDisplayed('NoKnockRequestsEmpty', 20000)
    // Pop back to the chat list so the bottom tab bar is visible again
    // (it's hidden on stacked screens).
    await t.clickElementByKey('HeaderBackButton') // members -> settings
    await t.clickElementByKey('HeaderBackButton') // settings -> conversation
    await t.clickElementByKey('HeaderBackButton') // conversation -> chat list
}
