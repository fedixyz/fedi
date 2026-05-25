/* eslint-disable no-console */
import { Fixture } from './types'

export const TEST_GROUPS = [
    {
        name: 'E2E Private Group',
        message: 'This is a private group message',
        isPublic: false,
        broadcastOnly: false,
    },
    {
        name: 'E2E Broadcast Group',
        message: 'This is a broadcast-only message',
        isPublic: false,
        broadcastOnly: true,
    },
    {
        name: 'E2E Public Group',
        message: 'This is a public group message',
        isPublic: true,
        broadcastOnly: false,
    },
    {
        name: 'E2E Public Broadcast Group',
        message: 'This is a public broadcast message',
        isPublic: true,
        broadcastOnly: true,
    },
] as const

export const setupChatTimelineWithGroups: Fixture = {
    produces: 'chatTimelineWithGroups',
    requires: ['onboarded'],
    async run(t) {
        console.log('Fixture: setupChatTimelineWithGroups')
        await t.clickElementByKey('ChatTabButton')
        await t.waitForElementDisplayed('SearchButton')

        for (const group of TEST_GROUPS) {
            await t.clickElementByKey('PlusButton')
            await t.clickOnText('Create a group', 0, true)
            await t.waitForElementDisplayed('GroupNameInput')
            await t.typeIntoElementByKey('GroupNameInput', group.name)
            if (group.broadcastOnly)
                await t.clickElementByKey('BroadcastOnlySwitch')
            if (group.isPublic) await t.clickElementByKey('PublicSwitch')
            await t.clickElementByKey('CreateGroupButton')
            try {
                await t.dismissAlert('Allow')
            } catch {
                /* no-op */
            }
            await t.waitForElementDisplayed('MessageInput-TextInput')
            await t.typeIntoElementByKey(
                'MessageInput-TextInput',
                group.message,
            )
            await t.waitForElementDisplayed('MessageInput-SendButton')
            await t.clickElementByKey('MessageInput-SendButton')
            await t.clickElementByKey('HeaderBackButton')
        }
    },
}
