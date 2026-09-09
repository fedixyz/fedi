/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'

export type Group = {
    name: string
    message: string
    isPublic: boolean
    broadcastOnly: boolean
}

export const PRIVATE_GROUP: Group = {
    name: 'E2E Private Group',
    message: 'This is a private group message',
    isPublic: false,
    broadcastOnly: false,
}
export const BROADCAST_GROUP: Group = {
    name: 'E2E Broadcast Group',
    message: 'This is a broadcast-only message',
    isPublic: false,
    broadcastOnly: true,
}
export const PUBLIC_GROUP: Group = {
    name: 'E2E Public Group',
    message: 'This is a public group message',
    isPublic: true,
    broadcastOnly: false,
}
export const PUBLIC_BROADCAST_GROUP: Group = {
    name: 'E2E Public Broadcast Group',
    message: 'This is a public broadcast message',
    isPublic: true,
    broadcastOnly: true,
}

export const ALL_GROUPS: Group[] = [
    PRIVATE_GROUP,
    BROADCAST_GROUP,
    PUBLIC_GROUP,
    PUBLIC_BROADCAST_GROUP,
]
// Private rooms default to allowKnocking=true (mutex with isPublic),
// so both private groups are knockable; the public ones are not.
export const KNOCKABLE_GROUPS: Group[] = [PRIVATE_GROUP, BROADCAST_GROUP]

// Both Home and Chat headers reuse MainHeaderButtons, so the PlusButton
// testID is ambiguous mid-tab-switch and a tap can land on Home's
// "join community" handler instead of Chat's overlay. SearchButton is
// only rendered by ChatHeader, so waiting on it confirms the chat tab
// is actually mounted before any tap.
export async function switchToChatTab(t: AppiumTestBase): Promise<void> {
    await t.clickElementByKey('ChatTabButton')
    await t.waitForElementDisplayed('SearchButton')
}

// Leaves the device inside the new room; callers navigate back or
// capture the room id from there.
export async function createGroupAndSendMessage(
    t: AppiumTestBase,
    group: Group,
): Promise<void> {
    console.log(`[${t.handle}] Creating group: ${group.name}`)
    await t.clickElementByKey('PlusButton')
    // Local UI, not matrix-gated, but a busy RN thread on a loaded CI host
    // can render the menu late; MATRIX_TIMEOUT is just the bigger budget.
    await t.clickOnText('Create a group', 0, true, MATRIX_TIMEOUT)
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
    // Sending the first message makes chatList non-empty, which fires the iOS
    // notification prompt; clear it before the caller's next tap.
    await t.acceptIosNotificationPromptIfPresent()
}

export async function createGroupAndCaptureRoomId(
    t: AppiumTestBase,
    group: Group,
): Promise<string> {
    await createGroupAndSendMessage(t, group)
    const roomId = await captureRoomIdFromCurrentRoom(t)
    await t.clickElementByKey('HeaderBackButton')
    return roomId
}

export async function captureRoomIdFromCurrentRoom(
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

export async function openRoomByName(
    t: AppiumTestBase,
    name: string,
): Promise<void> {
    // Tap the chat tile via push navigation. Deep links route through
    // ConfirmJoinPublicGroup which dispatches resetToGroupChat; on iOS
    // the gear button onPress silently no-ops after that reset. Tile
    // tap arrives at ChatRoomConversation via push and keeps the gear
    // functional.
    await t.acceptIosNotificationPromptIfPresent()
    await t.clickElementByKey('ChatTabButton')
    await t.waitForElementDisplayed('SearchButton')
    await t.acceptIosNotificationPromptIfPresent()
    // testID derived from room title in ChatTile.tsx. Partial-text
    // scrolling on iOS resolved to the ScrollView root and the
    // default-child tap took the user to the wrong room.
    const tileKey = `ChatTile-${name}`
    await t.scrollToElement(tileKey)
    await t.clickElementByKey(tileKey)
    await t.waitForElementDisplayed('MessageInput-TextInput', MATRIX_TIMEOUT)
}

export async function knockOnRoom(
    t: AppiumTestBase,
    roomId: string,
): Promise<void> {
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

export async function respondToOnlyKnock(
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
            await t.waitForElementDisplayed(button, MATRIX_TIMEOUT)
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
