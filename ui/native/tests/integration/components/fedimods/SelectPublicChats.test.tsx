import { screen, userEvent, waitFor } from '@testing-library/react-native'
import { t } from 'i18next'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import { SelectPublicChatsOverlay } from '../../../../components/feature/fedimods/SelectPublicChats'
import { renderWithBridge } from '../../../utils/render'

describe('SelectPublicChats', () => {
    const builder = createIntegrationTestBuilder(waitFor)
    const context = builder.getContext()
    const user = userEvent.setup()
    const onAccept = jest.fn()
    const onReject = jest.fn()
    const onOpenChange = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should display the correct title, description, and list all public chats', async () => {
        await builder.withChatReady()

        const {
            bridge: { fedimint },
            store,
        } = context

        await builder.withChatGroupCreated('public', true, false)
        await builder.withChatGroupCreated('public-broadcast', true, true)
        await builder.withChatGroupCreated('private', false, false)
        await builder.withChatGroupCreated('private-broadcast', false, true)

        renderWithBridge(
            <SelectPublicChatsOverlay
                open
                onOpenChange={onOpenChange}
                onAccept={onAccept}
                onReject={onReject}
            />,
            { store, fedimint },
        )

        const title = await screen.getByText(
            t('feature.chat.add-community-chat'),
        )
        const description = await screen.getByText(
            t('feature.chat.community-chat-description'),
        )

        expect(title).toBeOnTheScreen()
        expect(description).toBeOnTheScreen()

        expect(await screen.getByText('public')).toBeOnTheScreen()
        expect(await screen.getByText('public-broadcast')).toBeOnTheScreen()
        expect(await screen.queryByText('private')).not.toBeOnTheScreen()
        expect(
            await screen.queryByText('private-broadcast'),
        ).not.toBeOnTheScreen()
    })

    it('should complete with the selected public chats', async () => {
        const oneId = await builder.withChatGroupCreated('one', true, false)
        const twoId = await builder.withChatGroupCreated('two', true, false)
        const threeId = await builder.withChatGroupCreated('three', true, true)

        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(
            <SelectPublicChatsOverlay
                open
                onOpenChange={onOpenChange}
                onAccept={onAccept}
                onReject={onReject}
            />,
            { store, fedimint },
        )

        const oneText = await screen.getByText('one')
        const twoText = await screen.getByText('two')
        const threeText = await screen.getByText('three')

        await user.press(oneText)
        await user.press(twoText)
        await user.press(threeText)

        const continueButton = await screen.getByText(t('words.continue'))
        await user.press(continueButton)

        await waitFor(() => {
            expect(onAccept).toHaveBeenCalledWith([oneId, twoId, threeId])
        })
    })

    it('should display the empty state when there are no public chats', async () => {
        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(
            <SelectPublicChatsOverlay
                open
                onOpenChange={onOpenChange}
                onAccept={onAccept}
                onReject={onReject}
            />,
            { store, fedimint },
        )

        const emptyTitle = await screen.getByText(
            t('feature.chat.no-public-chats-yet'),
        )
        const emptyDescription = await screen.getByText(
            t('feature.chat.create-or-join-public-chat'),
        )

        expect(emptyTitle).toBeOnTheScreen()
        expect(emptyDescription).toBeOnTheScreen()
    })

    it('should create a new public group chat', async () => {
        await builder.withChatReady()

        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(
            <SelectPublicChatsOverlay
                open
                onOpenChange={onOpenChange}
                onAccept={onAccept}
                onReject={onReject}
            />,
            { store, fedimint },
        )

        const newGroupButton = await screen.getByText(
            t('feature.chat.new-group'),
        )

        await user.press(newGroupButton)

        const broadcastOnlyLabel = await screen.getByText(
            t('feature.chat.broadcast-only'),
        )
        const publicLabel = await screen.getByText(t('words.public'))
        const publicNotice = await screen.getByText(
            t('feature.chat.public-group-warning'),
        )

        expect(broadcastOnlyLabel).toBeOnTheScreen()
        expect(publicLabel).toBeOnTheScreen()
        expect(publicNotice).toBeOnTheScreen()

        const groupNameInput = await screen.getByPlaceholderText(
            t('feature.chat.group-name'),
        )

        await user.type(groupNameInput, 'group')

        const saveButton = await screen.getByText(t('phrases.save-changes'))
        await user.press(saveButton)

        await waitFor(() => expect(saveButton).not.toBeDisabled())
        await waitFor(() => expect(newGroupButton).toBeOnTheScreen())
    })

    it('should complete with an empty array if the overlay is closed without selecting any chats', async () => {
        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(
            <SelectPublicChatsOverlay
                open
                onOpenChange={onOpenChange}
                onAccept={onAccept}
                onReject={onReject}
            />,
            { store, fedimint },
        )

        const overlay = await screen.getByTestId('RNE__Overlay__backdrop')

        await user.press(overlay)

        expect(onAccept).toHaveBeenCalledWith([])
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })
})
