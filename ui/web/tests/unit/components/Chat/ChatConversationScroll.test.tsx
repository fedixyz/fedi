import '@testing-library/jest-dom'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    setMatrixAuth,
    setMatrixRoomMembers,
    handleMatrixRoomTimelineStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import {
    createMockNonPaymentEvent,
    mockRoomMembers,
} from '@fedi/common/tests/mock-data/matrix-event'
import { ChatType, MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import { mockUseRouter } from '../../../../jest.setup'
import { ChatConversation } from '../../../../src/components/Chat/ChatConversation'
import { renderWithProviders } from '../../../utils/render'

jest.mock('../../../../src/hooks/dom')

const mockHandlePaginate = jest.fn()

jest.mock('@fedi/common/hooks/matrix', () => ({
    ...jest.requireActual('@fedi/common/hooks/matrix'),
    useObserveMatrixRoom: jest.fn(() => ({
        paginationStatus: 'idle',
        isPaginating: false,
        canPaginateFurther: true,
        handlePaginate: mockHandlePaginate,
        showLoading: false,
    })),
}))

// Stub ChatEvent to a simple component that exposes the onReplyTap handler
// via a clickable button, simulating what happens when a user taps a reply.
jest.mock('../../../../src/components/Chat/ChatEvent', () => ({
    ChatEvent: ({
        event,
        onReplyTap,
    }: {
        event: { id: string; content: { body: string }; inReply?: any }
        onReplyTap?: (eventId: string) => void
    }) => (
        <div data-testid={`event-${event.id}`}>
            <span>{event.content.body}</span>
            {event.inReply?.id && onReplyTap && (
                <button
                    data-testid={`reply-tap-${event.id}`}
                    onClick={() => onReplyTap(event.inReply.id)}>
                    reply:{event.inReply.id}
                </button>
            )}
        </div>
    ),
}))

const ROOM_ID = '!test-room:example.com'
const SELF_USER_ID = '@self:example.com'

function storeWithConversation(events: MatrixEvent[]) {
    const store = setupStore()
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            { PushBack: { value: { status: 'ready', id: ROOM_ID } } },
        ]),
    )
    store.dispatch(
        addMatrixRoomInfo({
            ...MOCK_MATRIX_ROOM,
            id: ROOM_ID,
        }),
    )
    store.dispatch(
        setMatrixAuth({
            userId: SELF_USER_ID,
            deviceId: 'device1',
            displayName: 'Self',
            avatarUrl: undefined,
        }),
    )
    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId: ROOM_ID,
            updates: [{ Clear: {} }],
        }),
    )
    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId: ROOM_ID,
            updates: [{ Append: { values: events } }],
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

// Create a burst of messages from the same sender within the same second.
// In the old group-based code, all these would be in one group and tapping
// a reply would scroll to the group, not the exact message.
function makeBurstEvents(count = 5) {
    return Array.from({ length: count }, (_, index) =>
        createMockNonPaymentEvent({
            id: `$burst-${index}` as RpcTimelineEventItemId,
            roomId: ROOM_ID,
            sender: '@alice:example.com',
            timestamp: 1_750_083_034_389 - index * 1000,
            content: {
                body: `Message ${index}`,
                formatted: null,
            },
        }),
    )
}

describe('/components/Chat/ChatConversation scroll behavior', () => {
    let scrollIntoViewMock: jest.Mock

    beforeEach(() => {
        scrollIntoViewMock = jest.fn()
        Element.prototype.scrollIntoView = scrollIntoViewMock
        mockUseRouter.asPath = ''
        mockHandlePaginate.mockResolvedValue(undefined)
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should render each event with its own data-event-id attribute', () => {
        const events = makeBurstEvents(3)
        const store = storeWithConversation(events)

        const { container } = renderWithProviders(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                name="Test Room"
                onSendMessage={jest.fn()}
            />,
            { store },
        )

        // Each event should have its own data-event-id (not grouped)
        expect(
            container.querySelector('[data-event-id="$burst-0"]'),
        ).toBeInTheDocument()
        expect(
            container.querySelector('[data-event-id="$burst-1"]'),
        ).toBeInTheDocument()
        expect(
            container.querySelector('[data-event-id="$burst-2"]'),
        ).toBeInTheDocument()
    })

    it('should scroll to the exact replied-to message when reply is tapped', async () => {
        const burstEvents = makeBurstEvents(5)
        // Add a reply event from a different sender that replies to $burst-3
        const replyEvent = createMockNonPaymentEvent({
            id: '$reply' as RpcTimelineEventItemId,
            roomId: ROOM_ID,
            sender: '@bob:example.com',
            timestamp: 1_750_083_034_389 + 5000,
            content: {
                body: 'Replying to message 3',
                formatted: null,
            },
            inReply: {
                kind: 'ready',
                id: '$burst-3',
                sender: '@alice:example.com',
                content: {
                    msgtype: 'm.text',
                    body: 'Message 3',
                    formatted: null,
                },
            } as any,
        })
        const events = [replyEvent, ...burstEvents]
        const store = storeWithConversation(events)

        const { container } = renderWithProviders(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                name="Test Room"
                onSendMessage={jest.fn()}
            />,
            { store },
        )

        // Tap the reply preview in the reply event
        fireEvent.click(screen.getByTestId('reply-tap-$reply'))

        await waitFor(() => {
            expect(scrollIntoViewMock).toHaveBeenCalled()
        })

        // Verify scrollIntoView was called on the exact target element ($burst-3),
        // not on a group container
        const targetEl = container.querySelector('[data-event-id="$burst-3"]')
        expect(targetEl).toBeInTheDocument()
        expect(targetEl!.scrollIntoView).toBe(scrollIntoViewMock)
    })

    it('should scroll to the exact message from URL hash parameter', async () => {
        jest.useFakeTimers()

        const events = makeBurstEvents(5)
        const store = storeWithConversation(events)
        mockUseRouter.asPath = `/chat/${ROOM_ID}#message=$burst-2`

        const { container } = renderWithProviders(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                name="Test Room"
                onSendMessage={jest.fn()}
            />,
            { store },
        )

        // The debounced effect fires after 300ms
        act(() => {
            jest.advanceTimersByTime(300)
        })

        await waitFor(() => {
            expect(scrollIntoViewMock).toHaveBeenCalled()
        })

        const targetEl = container.querySelector('[data-event-id="$burst-2"]')
        expect(targetEl).toBeInTheDocument()

        jest.useRealTimers()
    })

    it('should paginate when the user scrolls to older messages', async () => {
        const events = makeBurstEvents(5)
        const store = storeWithConversation(events)

        renderWithProviders(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                name="Test Room"
                onSendMessage={jest.fn()}
            />,
            { store },
        )

        const messages = screen.getByTestId('chat-messages')
        Object.defineProperty(messages, 'clientHeight', {
            configurable: true,
            value: 500,
        })
        Object.defineProperty(messages, 'scrollHeight', {
            configurable: true,
            value: 1000,
        })
        Object.defineProperty(messages, 'scrollTop', {
            configurable: true,
            value: -450,
        })

        fireEvent.scroll(messages)

        await waitFor(() => {
            expect(mockHandlePaginate).toHaveBeenCalledTimes(1)
        })
    })

    it('should not paginate repeatedly while the user remains at older messages boundary', async () => {
        const events = makeBurstEvents(5)
        const store = storeWithConversation(events)

        renderWithProviders(
            <ChatConversation
                type={ChatType.group}
                id={ROOM_ID}
                name="Test Room"
                onSendMessage={jest.fn()}
            />,
            { store },
        )

        const messages = screen.getByTestId('chat-messages')
        Object.defineProperty(messages, 'clientHeight', {
            configurable: true,
            value: 500,
        })
        Object.defineProperty(messages, 'scrollHeight', {
            configurable: true,
            value: 1000,
        })
        Object.defineProperty(messages, 'scrollTop', {
            configurable: true,
            value: -450,
        })

        fireEvent.scroll(messages)
        fireEvent.scroll(messages)

        await waitFor(() => {
            expect(mockHandlePaginate).toHaveBeenCalledTimes(1)
        })

        Object.defineProperty(messages, 'scrollTop', {
            configurable: true,
            value: 0,
        })
        fireEvent.scroll(messages)

        Object.defineProperty(messages, 'scrollTop', {
            configurable: true,
            value: -450,
        })
        fireEvent.scroll(messages)

        await waitFor(() => {
            expect(mockHandlePaginate).toHaveBeenCalledTimes(2)
        })
    })
})
