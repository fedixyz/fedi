import { expect } from '@playwright/test'

import { BasePage } from './base.page'
import { Group } from './chat-groups'

// State that arrives via matrix sync (a knock landing on the admin, membership
// flipping after an accept) can lag well behind the local action.
const SYNC_TIMEOUT = 120_000

export class ChatPage extends BasePage {
    async onboardWithNewSeed() {
        await this.goto('/')
        await this.startOnboardingFromWelcome()
        await this.waitForUrl('**/wallet', 120_000)
    }

    async goToChatList() {
        await this.goto('/chat')
        await expect(
            this.page.getByTestId('MainHeaderButtons__AddIcon'),
        ).toBeVisible({ timeout: 30_000 })
    }

    roomTile(name: string) {
        return this.page.getByRole('link', { name })
    }

    // Creates the group through the chat list UI, sends one message, and
    // returns the room id read off the conversation URL.
    async createGroupAndSendMessage(group: Group): Promise<string> {
        await this.goToChatList()
        await this.page.getByTestId('MainHeaderButtons__AddIcon').click()
        await this.page
            .getByRole('link', { name: 'Create a group', exact: true })
            .click()

        const nameInput = this.page.getByLabel('Group name')
        await expect(nameInput).toBeVisible({ timeout: 30_000 })
        await nameInput.fill(group.name)
        if (group.broadcastOnly) {
            await this.page.getByTestId('BroadcastOnlySwitch').click()
        }
        if (group.isPublic) {
            await this.page.getByTestId('PublicSwitch').click()
        }
        await this.page
            .getByRole('button', { name: 'Create group', exact: true })
            .click()

        await this.waitForUrl(/\/chat\/room\//, 60_000)
        const roomId = decodeURIComponent(
            new URL(this.page.url()).pathname.split('/chat/room/')[1],
        )

        const input = this.page.getByPlaceholder('Type message...')
        await expect(input).toBeEditable({ timeout: 60_000 })
        await input.fill(group.message)
        await this.page.getByLabel('send-button').click()
        await expect(
            this.page.getByTestId('chat-messages').getByText(group.message),
        ).toBeVisible({ timeout: 60_000 })
        return roomId
    }

    // The tile's accessible name concatenates title and preview, so the name
    // locator alone can't assert the preview; check it within the tile.
    async expectRoomTileWithPreview(group: Group) {
        const tile = this.roomTile(group.name)
        await expect(tile).toBeVisible({ timeout: SYNC_TIMEOUT })
        await expect(tile.getByText(group.message)).toBeVisible()
    }

    // Replicates native's deep-link knock: land on the join screen, request
    // to join, see the pending view, and back out to the chat list.
    async knockOnRoom(roomId: string) {
        await this.goto(`/chat/join-room/${roomId}`)
        const requestToJoin = this.page.getByRole('button', {
            name: 'Request to join',
            exact: true,
        })
        await expect(requestToJoin).toBeVisible({ timeout: SYNC_TIMEOUT })
        await requestToJoin.click()
        await expect(this.page.getByText('Request pending')).toBeVisible({
            timeout: SYNC_TIMEOUT,
        })
        await this.page
            .getByRole('button', { name: 'Go back', exact: true })
            .click()
    }

    async openRoomByName(name: string) {
        await this.goToChatList()
        await this.roomTile(name).click()
        await this.waitForUrl(/\/chat\/room\//)
    }

    // The knock only lands on the admin via matrix sync, and the members list
    // refetches on mount, so reopen the settings dialog until the request
    // shows up on the pending tab (the native appium test does the same).
    async respondToOnlyKnock(roomName: string, action: 'accept' | 'decline') {
        await this.openRoomByName(roomName)
        const requestTile = this.page
            .getByText('Requested to join', { exact: true })
            .first()

        let handled = false
        for (let attempt = 0; attempt < 36 && !handled; attempt++) {
            await this.page.getByTestId('ChatRoomSettingsButton').click()
            await this.page
                .getByRole('dialog')
                .getByText('Members', { exact: true })
                .click()
            await this.page.getByTestId('pendingTab').click()
            handled = await requestTile
                .waitFor({ state: 'visible', timeout: 5_000 })
                .then(() => true)
                .catch(() => false)
            if (!handled) await this.closeDialog()
        }
        if (!handled) throw new Error('knock request never appeared')

        await requestTile.click()
        const actionButton = this.page.getByText(
            action === 'accept' ? 'Accept' : 'Decline',
            { exact: true },
        )
        await actionButton.click()
        // The action tray closes once the response lands on the homeserver.
        await expect(actionButton).toBeHidden({ timeout: 60_000 })
        await this.closeDialog()
    }

    // A joined, non-broadcast room renders an editable message input; until
    // the accept arrives via sync the tile lands on the knock-pending view.
    async expectRoomIsWriteable(name: string) {
        await this.openRoomByName(name)
        await expect(
            this.page.getByPlaceholder('Type message...'),
        ).toBeEditable({ timeout: SYNC_TIMEOUT })
    }

    // Joins a community from its invite code; joining selects it, so its
    // chats render as tiles on the home screen.
    async joinCommunity(code: string) {
        await this.goto(`/onboarding/join?id=${encodeURIComponent(code)}`)
        const joinSpace = this.page.getByRole('button', {
            name: 'Join Space',
            exact: true,
        })
        await expect(joinSpace).toBeVisible({ timeout: 60_000 })
        await joinSpace.click()
        await this.waitForUrl('**/home', 60_000)
    }

    // A community chat tile on the home screen. Its accessible name includes
    // the room name plus whatever the join-state slot renders.
    homeChatTile(name: string) {
        return this.page.getByRole('link', { name })
    }

    private closeDialog() {
        return this.page.getByTestId('dialog-close-button').click()
    }
}
