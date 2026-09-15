/* eslint-disable no-console */
import {
    AppiumTestBase,
    MATRIX_TIMEOUT,
} from '../../configs/appium/AppiumTestBase'
import { Platform } from '../../configs/appium/types'
import { setupOnboarded } from '../fixtures/setupOnboarded'
import {
    ALL_GROUPS,
    BROADCAST_GROUP,
    PRIVATE_GROUP,
    PUBLIC_GROUP,
    createGroupAndSendMessage,
    disableJoinRequests,
    switchToChatTab,
} from './chatGroups'
import { createSpaceWithChats } from './communityTool'

// End-to-end coverage for the join button on community chat tiles
// (the DefaultChatTile component).
//
// Two actors: the admin owns the chats and the Space, so the joiner is a
// non-member and every default chat, public and knockable, offers Join.
// Tapping Join opens the room preview (the same screen scanning the invite
// opens) so the user confirms there instead of joining from the tile.
//
// WebView automation (the community tool) is Android-only for now. iOS
// WKWebView context handling is a follow-up.
export class CommunityChatJoin extends AppiumTestBase {
    static prerequisites = ['onboarded'] as const
    // Marker no other test consumes, so the runner resets to a fresh account
    // before the next test instead of inheriting this one's rooms.
    static produces = ['onboarded', 'chatRoomsCreated'] as const
    static actors = 2
    static supportedPlatforms = [Platform.ANDROID] as const

    async execute(): Promise<void> {
        console.log('Starting CommunityChatJoin test')

        // eslint-disable-next-line @typescript-eslint/no-this-alias, consistent-this
        const admin: AppiumTestBase = this
        const joiner = await this.spawnActor('b')
        await setupOnboarded.run(joiner)

        // Admin: create every group shape, then bundle them into a Space.
        await switchToChatTab(admin)
        for (const group of ALL_GROUPS) {
            await createGroupAndSendMessage(admin, group)
            await admin.clickElementByKey('HeaderBackButton')
        }
        const invite = await createSpaceWithChats(
            admin,
            'E2E Join Space',
            ALL_GROUPS.map(g => g.name),
        )

        // Joiner: join the Space by pasting its invite.
        await joiner.acceptIosNotificationPromptIfPresent()
        await joiner.setClipboard(invite)
        await joiner.clickElementByKey('HomeTabButton')
        await joiner.clickElementByKey('PlusButton')
        await joiner.clickElementByKey('joinTab')
        await joiner.clickElementByKey('PasteButton')
        // Pasting an invite raises a "this is a space invitation" sheet whose
        // Continue button carries the label as its accessibility id (the text
        // sits on a non-clickable child, so a text tap misses the button).
        await joiner.clickElementByKey('Continue', MATRIX_TIMEOUT)
        // Then the preview, whose join control reuses the JoinFederationButton
        // testID.
        await joiner.clickElementByKey('JoinFederationButton', MATRIX_TIMEOUT)

        // devimint previews private rooms, so every tile carries a real name.
        await joiner.clickElementByKey('HomeTabButton')
        await joiner.scrollToElement(
            `DefaultChatTileJoinButton-${PUBLIC_GROUP.name}`,
        )
        await joiner.saveScreenshot('community-default-chats')
        for (const group of ALL_GROUPS.filter(g => g.isPublic)) {
            // Each Join opens the room, and going back lands on the Chat tab,
            // so return to the Spaces screen where the join-button tiles render
            // before driving the next one.
            await joiner.clickElementByKey('HomeTabButton')
            const joinKey = `DefaultChatTileJoinButton-${group.name}`
            const tile = await joiner.scrollToElement(joinKey)
            if (!tile) {
                throw new Error(`No Join button on tile for "${group.name}"`)
            }
            await joiner.clickElementByKey(joinKey)
            await joiner.waitForElementDisplayed(
                'HeaderBackButton',
                MATRIX_TIMEOUT,
            )
            await joiner.clickElementByKey('HeaderBackButton')
        }

        // Guards that the invite-only handling below doesn't cost a room that
        // really does accept requests.
        await joiner.clickElementByKey('HomeTabButton')
        await joiner.clickElementByKey(
            `DefaultChatTileJoinButton-${PRIVATE_GROUP.name}`,
            MATRIX_TIMEOUT,
        )
        await joiner.waitForElementDisplayed(
            'ConfirmJoinButton',
            MATRIX_TIMEOUT,
        )
        await joiner.clickElementByKey('ConfirmJoinButton')
        await joiner.waitForElementDisplayed('KnockPendingView', MATRIX_TIMEOUT)
        await joiner.saveScreenshot('knockable-reaches-pending')
        await joiner.clickElementByKey('HeaderCloseButton')

        // The joiner previewed this room while it still took join requests, and
        // the confirm sheet reads that cached preview rather than refetching,
        // so it keeps offering a request the server will now refuse.
        await disableJoinRequests(admin, BROADCAST_GROUP.name)

        // Tapping the Spaces tab while already on Spaces opens the switcher
        // over the tiles.
        await joiner.clickElementByKey(
            `DefaultChatTileJoinButton-${BROADCAST_GROUP.name}`,
            MATRIX_TIMEOUT,
        )
        await joiner.waitForElementDisplayed(
            'ConfirmJoinButton',
            MATRIX_TIMEOUT,
        )
        await joiner.clickElementByKey('ConfirmJoinButton')

        await joiner.waitForText(
            'This group is invite-only. Ask an admin to add you.',
            0,
            true,
            MATRIX_TIMEOUT,
        )
        await joiner.saveScreenshot('invite-only-after-refused-knock')

        // Both look for text that should already be absent, so don't wait the
        // default out.
        const ABSENCE_TIMEOUT = 5000
        if (
            await joiner.getTextInstanceCount(
                'BridgeError',
                false,
                ABSENCE_TIMEOUT,
            )
        ) {
            throw new Error('Raw BridgeError text was shown to the user')
        }
        if (
            await joiner.getTextInstanceCount(
                'Request to join',
                true,
                ABSENCE_TIMEOUT,
            )
        ) {
            throw new Error(
                'Request to join still offered after the server refused the knock',
            )
        }
    }

    catch(error: unknown) {
        console.error('CommunityChatJoin test failed:', error)
    }
}
