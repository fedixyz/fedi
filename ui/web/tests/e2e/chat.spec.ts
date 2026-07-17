import {
    ALL_GROUPS,
    BROADCAST_GROUP,
    KNOCKABLE_GROUPS,
    PRIVATE_GROUP,
} from './fixtures/chat-groups'
import { test, expect } from './fixtures/test'

// Replicates the native appium Chat e2e
// (ui/native/tests/appium/common/Chat.test.ts): an admin creates the four
// group shapes and messages each, a second user knocks on the private ones,
// the admin accepts one knock and declines the other, and the second user
// lands in the accepted room and can re-knock the declined one. The admin
// then bundles the groups into a Space, and the second user's home tiles
// expose each chat's join state.
test('groups are created and knock requests are resolved', async ({
    chat,
    communityTool,
    knockerChat,
}) => {
    // Two onboardings, a Space publish, and several matrix sync round-trips
    // outlast even the long shared timeout.
    test.setTimeout(900_000)

    // Admin: create each group shape and message it.
    await chat.onboardWithNewSeed()
    const roomIds: Record<string, string> = {}
    for (const group of ALL_GROUPS) {
        roomIds[group.name] = await chat.createGroupAndSendMessage(group)
    }
    await chat.goToChatList()
    for (const group of ALL_GROUPS) {
        await chat.expectRoomTileWithPreview(group)
    }

    // Knocker: a brand-new user requests to join both private groups.
    await knockerChat.onboardWithNewSeed()
    for (const group of KNOCKABLE_GROUPS) {
        await knockerChat.knockOnRoom(roomIds[group.name])
    }
    await knockerChat.goToChatList()
    for (const group of KNOCKABLE_GROUPS) {
        await expect(knockerChat.roomTile(group.name)).toBeVisible({
            timeout: 60_000,
        })
    }

    // Admin: accept the knock in one room, decline it in the other.
    await chat.respondToOnlyKnock(PRIVATE_GROUP.name, 'accept')
    await chat.respondToOnlyKnock(BROADCAST_GROUP.name, 'decline')

    // Knocker: the accepted room is writeable; the declined one can be
    // knocked again.
    await knockerChat.expectRoomIsWriteable(PRIVATE_GROUP.name)
    await knockerChat.knockOnRoom(roomIds[BROADCAST_GROUP.name])

    // Admin: bundle the groups into a Space so they surface as community
    // chat tiles. The knocker's membership in each is now joined
    // (private), knock-pending (broadcast), and none (both public rooms).
    const communityCode = await communityTool.createSpace(
        'E2E Knock Space',
        ALL_GROUPS.map(g => g.name),
    )

    // Knocker: each home tile reflects its join state: joined chats keep
    // the bare chevron, a pending knock shows Pending, and an unjoined
    // public chat's Join button opens the confirm-join screen.
    await knockerChat.joinCommunity(communityCode)

    const joinedTile = knockerChat.homeChatTile(PRIVATE_GROUP.name)
    await expect(
        joinedTile.getByTestId('DefaultRoomPreview__chevron'),
    ).toBeVisible({ timeout: 60_000 })
    await expect(joinedTile.getByRole('button')).toHaveCount(0)

    const pendingTile = knockerChat.homeChatTile(BROADCAST_GROUP.name)
    await expect(
        pendingTile.getByRole('button', { name: 'Pending', exact: true }),
    ).toBeVisible({ timeout: 60_000 })

    // Both public shapes (plain and broadcast-only) offer Join on their
    // tiles. Join routes to the confirm-join screen, the same screen a
    // scanned room invite opens, and Continue confirms the public join
    // and lands in the conversation.
    for (const group of ALL_GROUPS.filter(g => g.isPublic)) {
        const unjoinedTile = knockerChat.homeChatTile(group.name)
        const joinButton = unjoinedTile.getByRole('button', {
            name: 'Join',
            exact: true,
        })
        await expect(joinButton).toBeVisible({ timeout: 60_000 })
        await joinButton.click()

        await knockerChat.waitForUrl(/\/chat\/join-room\//, 60_000)
        const continueButton = knockerChat.page.getByRole('button', {
            name: 'Continue',
            exact: true,
        })
        await expect(continueButton).toBeVisible({ timeout: 60_000 })
        await continueButton.click()
        await knockerChat.waitForUrl(/\/chat\/room\//, 60_000)

        // Back on home, the now-joined chat's tile drops its Join button
        // for the bare chevron.
        await knockerChat.goto('/home')
        await expect(
            unjoinedTile.getByTestId('DefaultRoomPreview__chevron'),
        ).toBeVisible({ timeout: 60_000 })
        await expect(unjoinedTile.getByRole('button')).toHaveCount(0)
    }
})
