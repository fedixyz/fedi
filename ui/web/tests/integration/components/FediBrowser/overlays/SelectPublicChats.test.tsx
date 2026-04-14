import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from 'i18next'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import { SelectPublicChats } from '../../../../../src/components/FediBrowser/overlays/SelectPublicChats'
import { renderWithBridge } from '../../../../utils/render'

describe('SelectPublicChats', () => {
    const builder = createIntegrationTestBuilder(waitFor)
    const context = builder.getContext()
    const onConfirm = jest.fn()

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

        renderWithBridge(<SelectPublicChats open onConfirm={onConfirm} />, {
            store,
            fedimint,
        })

        const title = screen.getAllByText(t('feature.chat.add-community-chat'))
        const description = screen.getAllByText(
            t('feature.chat.community-chat-description'),
        )

        // Dialog titles and descriptions appear twice in the document for accessibility
        expect(title).toHaveLength(2)
        expect(description).toHaveLength(2)

        expect(screen.getByText('public')).toBeInTheDocument()
        expect(screen.getByText('public-broadcast')).toBeInTheDocument()
        expect(screen.queryByText('private')).not.toBeInTheDocument()
        expect(screen.queryByText('private-broadcast')).not.toBeInTheDocument()
    })

    it('should complete with the selected public chats', async () => {
        const user = userEvent.setup()
        const oneId = await builder.withChatGroupCreated('one', true, false)
        const twoId = await builder.withChatGroupCreated('two', true, false)
        const threeId = await builder.withChatGroupCreated('three', true, true)

        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(<SelectPublicChats open onConfirm={onConfirm} />, {
            store,
            fedimint,
        })

        const oneText = screen.getByText('one')
        const twoText = screen.getByText('two')
        const threeText = screen.getByText('three')

        await user.click(oneText)
        await user.click(twoText)
        await user.click(threeText)

        const continueButton = screen.getByText(t('words.continue'))
        await user.click(continueButton)

        await waitFor(() => {
            expect(onConfirm).toHaveBeenCalledWith([oneId, twoId, threeId])
        })
    })

    it('should display the empty state when there are no public chats', async () => {
        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(<SelectPublicChats open onConfirm={onConfirm} />, {
            store,
            fedimint,
        })

        const emptyTitle = screen.getByText(
            t('feature.chat.no-public-chats-yet'),
        )
        const emptyDescription = screen.getByText(
            t('feature.chat.create-or-join-public-chat'),
        )

        expect(emptyTitle).toBeInTheDocument()
        expect(emptyDescription).toBeInTheDocument()
    })

    it('should create a new public group chat', async () => {
        const user = userEvent.setup()
        await builder.withChatReady()

        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(<SelectPublicChats open onConfirm={onConfirm} />, {
            store,
            fedimint,
        })

        const newGroupButton = screen.getByText(t('feature.chat.new-group'))

        await user.click(newGroupButton)

        const broadcastOnlyLabel = screen.getByText(
            t('feature.chat.broadcast-only'),
        )
        const publicLabel = screen.getByText(t('words.public'))
        const publicNotice = screen.getByText(
            t('feature.chat.public-group-warning'),
        )

        expect(broadcastOnlyLabel).toBeInTheDocument()
        expect(publicLabel).toBeInTheDocument()
        expect(publicNotice).toBeInTheDocument()

        const groupNameInput = screen.getByPlaceholderText(
            t('feature.chat.group-name'),
        )

        await user.type(groupNameInput, 'new group')

        const saveButton = screen.getByText(t('phrases.save-changes'))

        expect(saveButton).toBeInTheDocument()
        expect(saveButton).not.toBeDisabled()

        await user.click(saveButton)

        await waitFor(() => expect(newGroupButton).toBeInTheDocument())
    })

    it('should complete with an empty array if the overlay is closed without selecting any chats', async () => {
        const user = userEvent.setup()
        const {
            bridge: { fedimint },
            store,
        } = context

        renderWithBridge(<SelectPublicChats open onConfirm={onConfirm} />, {
            store,
            fedimint,
        })

        const overlay = screen.getByTestId('dialog-close-button')

        expect(overlay).toBeInTheDocument()

        await user.click(overlay)

        expect(onConfirm).toHaveBeenCalledWith([])
    })
})
