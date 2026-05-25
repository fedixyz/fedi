/* eslint-disable no-console */
import { AppiumTestBase } from '../../configs/appium/AppiumTestBase'
import {
    setupChatTimelineWithGroups,
    TEST_GROUPS,
} from '../fixtures/setupChatTimelineWithGroups'

export class ChatTimeline extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    static produces = ['onboarded', 'chatTimelineWithGroups'] as const

    async execute(): Promise<void> {
        console.log('Starting ChatTimeline Test')
        await setupChatTimelineWithGroups.run(this)

        await this.switchToChatTab()
        for (const group of TEST_GROUPS) {
            await this.verifyGroupInChatList(group)
        }
        console.log('ChatTimeline Test completed successfully')
    }

    private async switchToChatTab(): Promise<void> {
        await this.clickElementByKey('ChatTabButton')
        await this.waitForElementDisplayed('SearchButton')
    }

    private async verifyGroupInChatList(group: {
        name: string
        message: string
    }): Promise<void> {
        const tile = await this.scrollToText(group.name, 0, false)
        if (!tile)
            throw new Error(
                `Failed - Group "${group.name}" not found in chat list`,
            )
        const messagePreview = await this.findElementByText(
            group.message,
            0,
            false,
        )
        if (!messagePreview)
            throw new Error(
                `Failed - Message preview for "${group.name}" not found. Expected: "${group.message}"`,
            )
        console.log(
            `Verified group "${group.name}" with title and message preview`,
        )
    }
}
