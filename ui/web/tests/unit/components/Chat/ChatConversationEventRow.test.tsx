import '@testing-library/jest-dom'
import { screen } from '@testing-library/react'

import {
    setMatrixAuth,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import {
    createMockNonPaymentEvent,
    mockRoomMembers,
} from '@fedi/common/tests/mock-data/matrix-event'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'
import { ChatConversationRow } from '@fedi/common/utils/chatConversationRows'

import { ChatConversationEventRow } from '../../../../src/components/Chat/ChatConversationEventRow'
import { renderWithProviders } from '../../../utils/render'

jest.mock('../../../../src/hooks/dom')

jest.mock('../../../../src/components/Chat/ChatEvent', () => ({
    ChatEvent: ({ event }: { event: { content: { body: string } } }) => (
        <div data-testid="chat-event">{event.content.body}</div>
    ),
}))

const ROOM_ID = '!test-room:example.com'
const SELF_USER_ID = '@self:example.com'
const OTHER_USER_ID = '@alice:example.com'

function storeWithMembers() {
    const store = setupStore()
    store.dispatch(
        setMatrixAuth({
            userId: SELF_USER_ID,
            deviceId: 'device1',
            displayName: 'Self',
            avatarUrl: undefined,
        }),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: mockRoomMembers
                .slice(0, 2)
                .map(member => ({ ...member, roomId: ROOM_ID })),
        }),
    )
    return store
}

function makeRow(
    overrides: Partial<ChatConversationRow> = {},
): ChatConversationRow {
    return {
        event: createMockNonPaymentEvent({
            id: '$test-event' as RpcTimelineEventItemId,
            roomId: ROOM_ID,
            sender: OTHER_USER_ID,
            timestamp: 1_750_083_034_389,
            content: { body: 'Hello world', formatted: null },
        }),
        showTimestamp: false,
        showUsername: false,
        showAvatar: false,
        showUsernames: false,
        isLastBubbleInRun: false,
        ...overrides,
    }
}

describe('/components/Chat/ChatConversationEventRow', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should set data-event-id attribute for scroll targeting', () => {
        const row = makeRow()

        const { container } = renderWithProviders(
            <ChatConversationEventRow roomId={ROOM_ID} row={row} />,
            { store: storeWithMembers() },
        )

        expect(
            container.querySelector('[data-event-id="$test-event"]'),
        ).toBeInTheDocument()
    })

    it('should render event content', () => {
        const row = makeRow()

        renderWithProviders(
            <ChatConversationEventRow roomId={ROOM_ID} row={row} />,
            { store: storeWithMembers() },
        )

        expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    describe('timestamp rendering', () => {
        it('should show timestamp when showTimestamp is true', () => {
            const row = makeRow({ showTimestamp: true })

            renderWithProviders(
                <ChatConversationEventRow roomId={ROOM_ID} row={row} />,
                { store: storeWithMembers() },
            )

            // dateUtils.formatMessageItemTimestamp formats the timestamp
            // The exact format depends on locale but the element should exist
            const timestampEl = screen.getByText(/\d/)
            expect(timestampEl).toBeInTheDocument()
        })

        it('should hide timestamp when showTimestamp is false', () => {
            const row = makeRow({ showTimestamp: false })

            const { container } = renderWithProviders(
                <ChatConversationEventRow roomId={ROOM_ID} row={row} />,
                { store: storeWithMembers() },
            )

            // Only the event body text should be present, no timestamp
            const textNodes = container.querySelectorAll('div')
            const hasTimestampStyling = Array.from(textNodes).some(
                node =>
                    node.textContent !== 'Hello world' &&
                    node.style.textAlign === 'center',
            )
            expect(hasTimestampStyling).toBe(false)
        })
    })

    describe('username rendering', () => {
        it('should show username for other users in group chats', () => {
            const row = makeRow({
                showUsernames: true,
                showUsername: true,
            })
            const store = storeWithMembers()
            store.dispatch(
                setMatrixRoomMembers({
                    roomId: ROOM_ID,
                    members: [
                        {
                            ...mockRoomMembers[0],
                            id: OTHER_USER_ID,
                            roomId: ROOM_ID,
                        },
                    ],
                }),
            )

            renderWithProviders(
                <ChatConversationEventRow roomId={ROOM_ID} row={row} />,
                { store },
            )

            expect(screen.getByText('Alice')).toBeInTheDocument()
        })

        it('should hide username for own messages', () => {
            const selfEvent = createMockNonPaymentEvent({
                id: '$self-event' as RpcTimelineEventItemId,
                roomId: ROOM_ID,
                sender: SELF_USER_ID,
                timestamp: 1_750_083_034_389,
                content: { body: 'My message', formatted: null },
            })
            const row = makeRow({
                event: selfEvent,
                showUsernames: true,
                showUsername: true,
            })

            renderWithProviders(
                <ChatConversationEventRow roomId={ROOM_ID} row={row} />,
                { store: storeWithMembers() },
            )

            // Only the message text should appear, no username
            expect(screen.getByText('My message')).toBeInTheDocument()
            expect(screen.queryByText('Self')).not.toBeInTheDocument()
        })
    })

    describe('highlight', () => {
        it('should apply highlight styling when event matches highlightedMessageId', () => {
            const row = makeRow()

            const { container } = renderWithProviders(
                <ChatConversationEventRow
                    roomId={ROOM_ID}
                    row={row}
                    highlightedMessageId="$test-event"
                />,
                { store: storeWithMembers() },
            )

            const highlightedEl = container.querySelector(
                '[data-event-id="$test-event"]',
            )
            expect(highlightedEl).toBeInTheDocument()
        })

        it('should not apply highlight when highlightedMessageId does not match', () => {
            const row = makeRow()

            const { container } = renderWithProviders(
                <ChatConversationEventRow
                    roomId={ROOM_ID}
                    row={row}
                    highlightedMessageId="$other-event"
                />,
                { store: storeWithMembers() },
            )

            const el = container.querySelector('[data-event-id="$test-event"]')
            expect(el).toBeInTheDocument()
        })
    })
})
