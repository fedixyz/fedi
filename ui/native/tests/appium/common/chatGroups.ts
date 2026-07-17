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
