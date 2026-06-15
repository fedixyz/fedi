import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { setFeatureFlags, setupStore } from '@fedi/common/redux'
import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MatrixEvent } from '@fedi/common/types'
import {
    FeatureCatalog,
    RpcTimelineEventItemId,
} from '@fedi/common/types/bindings'

import { ChatMessageActionsDrawer } from '../../../../src/components/Chat/ChatMessageActionsDrawer'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const ROOM_ID = '!room:example.com'
const EVENT_ID = '$event:example.com'

const event = createMockNonPaymentEvent({
    id: EVENT_ID as RpcTimelineEventItemId,
    roomId: ROOM_ID,
}) as MatrixEvent
const nonReplyableEvent = {
    ...event,
    content: {
        ...event.content,
        msgtype: 'm.audio',
    },
} as MatrixEvent
const reactablePollEvent: MatrixEvent<'m.poll'> = {
    id: '$poll-event' as RpcTimelineEventItemId,
    roomId: ROOM_ID,
    timestamp: Date.now(),
    localEcho: false,
    sender: '@other:example.com',
    sendState: null,
    inReply: null,
    mentions: null,
    canReact: true,
    reactions: [],
    content: {
        msgtype: 'm.poll',
        body: 'Where should we meet?',
        kind: 'disclosed',
        maxSelections: 1,
        answers: [
            { id: 'answer-1', text: 'Lobby' },
            { id: 'answer-2', text: 'Courtyard' },
        ],
        votes: {},
        endTime: null,
        hasBeenEdited: false,
    },
}

describe('/components/Chat/ChatMessageActionsDrawer', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should show web message actions without reactions', () => {
        renderWithProviders(
            <ChatMessageActionsDrawer
                event={event}
                open
                onOpenChange={jest.fn()}
            />,
            { store: setupStore() },
        )

        expect(screen.getByText(i18n.t('words.reply'))).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('feature.chat.pin-message')),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('feature.chat.create-poll')),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('words.react')),
        ).not.toBeInTheDocument()
    })

    it('should activate reply and close the drawer', async () => {
        const onOpenChange = jest.fn()
        const { store } = renderWithProviders(
            <ChatMessageActionsDrawer
                event={event}
                open
                onOpenChange={onOpenChange}
            />,
            { store: setupStore() },
        )

        await userEvent.click(screen.getByText(i18n.t('words.reply')))

        expect(store.getState().matrix.replyingToMessage.event?.id).toBe(
            EVENT_ID,
        )
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('should keep the drawer closeable when there are no available actions', async () => {
        const onOpenChange = jest.fn()
        renderWithProviders(
            <ChatMessageActionsDrawer
                event={nonReplyableEvent}
                open
                onOpenChange={onOpenChange}
            />,
            { store: setupStore() },
        )

        expect(
            screen.getByTestId('message-actions-backdrop'),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('words.reply')),
        ).not.toBeInTheDocument()

        await userEvent.keyboard('{Escape}')

        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('should show quick reactions when message reactions are enabled', () => {
        const store = setupStore()
        store.dispatch(
            setFeatureFlags({
                message_reactions: {},
            } as FeatureCatalog),
        )

        renderWithProviders(
            <ChatMessageActionsDrawer
                event={event}
                open
                onOpenChange={jest.fn()}
            />,
            { store },
        )

        expect(screen.getByText(i18n.t('words.react'))).toBeInTheDocument()
        expect(screen.getByLabelText('React 👍')).toBeInTheDocument()
        expect(screen.getByLabelText('more reactions')).toBeInTheDocument()
    })

    it('should not show quick reactions for polls', () => {
        const store = setupStore()
        store.dispatch(
            setFeatureFlags({
                message_reactions: {},
            } as FeatureCatalog),
        )

        renderWithProviders(
            <ChatMessageActionsDrawer
                event={reactablePollEvent}
                open
                onOpenChange={jest.fn()}
            />,
            { store },
        )

        expect(
            screen.getByTestId('message-actions-backdrop'),
        ).toBeInTheDocument()
        expect(
            screen.queryByText(i18n.t('words.react')),
        ).not.toBeInTheDocument()
        expect(screen.queryByLabelText('React 👍')).not.toBeInTheDocument()
    })

    it('should toggle a quick reaction and close the drawer', async () => {
        const store = setupStore()
        const toggleReaction = jest.fn().mockResolvedValue(true)
        const onOpenChange = jest.fn()
        store.dispatch(
            setFeatureFlags({
                message_reactions: {},
            } as FeatureCatalog),
        )

        renderWithProviders(
            <ChatMessageActionsDrawer
                event={event}
                open
                onOpenChange={onOpenChange}
            />,
            {
                store,
                fedimint: createMockFedimintBridge({
                    getMatrixClient: () => ({ toggleReaction }),
                } as any),
            },
        )

        await userEvent.click(screen.getByLabelText('React 👍'))

        expect(toggleReaction).toHaveBeenCalledWith(ROOM_ID, EVENT_ID, '👍')
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('should open the full emoji picker from the reactions row', async () => {
        const store = setupStore()
        store.dispatch(
            setFeatureFlags({
                message_reactions: {},
            } as FeatureCatalog),
        )

        renderWithProviders(
            <ChatMessageActionsDrawer
                event={event}
                open
                onOpenChange={jest.fn()}
            />,
            { store },
        )

        await userEvent.click(screen.getByLabelText('more reactions'))

        expect(screen.getByLabelText('emoji picker')).toBeInTheDocument()
        expect(screen.getByLabelText('search emoji')).toBeInTheDocument()
    })
})
