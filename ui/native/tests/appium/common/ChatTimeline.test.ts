/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'

export class ChatTimeline extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    static produces = ['onboarded'] as const

    async execute(): Promise<void> {
        console.log('Starting ChatTimeline Test')

        const groups = [
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
        ]

        await this.switchToChatTab()

        for (const group of groups) {
            console.log(`Creating group: ${group.name}`)
            await this.createGroupAndSendMessage(group)
        }

        await this.switchToChatTab()

        for (const group of groups) {
            console.log(`Verifying group in chat list: ${group.name}`)
            await this.verifyGroupInChatList(group)
        }

        console.log('ChatTimeline Test completed successfully')
    }

    // Both Home and Chat headers reuse MainHeaderButtons, so the
    // `PlusButton` testID is ambiguous mid-tab-switch and a tap can land
    // on Home's "join community" handler instead of Chat's overlay.
    // SearchButton is only rendered by ChatHeader, so waiting on it
    // confirms the chat tab is actually mounted before any tap.
    private async switchToChatTab(): Promise<void> {
        await this.clickElementByKey('ChatTabButton')
        await this.waitForElementDisplayed('SearchButton')
    }

    private async createGroupAndSendMessage(group: {
        name: string
        message: string
        isPublic: boolean
        broadcastOnly: boolean
    }): Promise<void> {
        await this.clickElementByKey('PlusButton')
        await this.clickOnText('Create a group', 0, true)
        await this.waitForElementDisplayed('GroupNameInput')
        await this.typeIntoElementByKey('GroupNameInput', group.name)

        if (group.broadcastOnly)
            await this.clickElementByKey('BroadcastOnlySwitch')
        if (group.isPublic) await this.clickElementByKey('PublicSwitch')

        await this.clickElementByKey('CreateGroupButton')
        try {
            await this.dismissAlert('Allow')
        } catch {
            /* no-op */
        }
        await this.waitForElementDisplayed('MessageInput-TextInput')

        console.log(`Sending message to ${group.name}: ${group.message}`)

        await this.typeIntoElementByKey('MessageInput-TextInput', group.message)
        await this.waitForElementDisplayed('MessageInput-SendButton')
        await this.clickElementByKey('MessageInput-SendButton')
        await this.clickElementByKey('HeaderBackButton')
    }

    private async verifyGroupInChatList(group: {
        name: string
        message: string
        isPublic: boolean
        broadcastOnly: boolean
    }): Promise<void> {
        // iOS XCUITest exact-match doesn't reliably resolve chat tile
        // text even when the tile is on-screen; partial match works on
        // both platforms.
        const tile = await this.scrollToText(group.name, 0, false)
        if (!tile) {
            throw new Error(
                `Failed - Group "${group.name}" not found in chat list`,
            )
        }

        const messagePreview = await this.findElementByText(
            group.message,
            0,
            false,
        )
        if (!messagePreview) {
            throw new Error(
                `Failed - Message preview for "${group.name}" not found. Expected: "${group.message}"`,
            )
        }

        console.log(
            `Verified group "${group.name}" with title and message preview`,
        )
    }
}
