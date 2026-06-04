import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    handleMatrixRoomTimelineStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import { ChatType, MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import { ChatConversation } from '../../../../src/components/Chat/ChatConversation'
import { renderWithProviders } from '../../../utils/render'

jest.mock('../../../../src/hooks/dom')

const ROOM_ID = '2'

const groupChatProps = {
    type: ChatType.group,
    id: ROOM_ID,
    name: 'name',
    onSendMessage: jest.fn(),
    onWalletClick: () => null,
}

const directChatProps = {
    type: ChatType.direct,
    id: ROOM_ID,
    name: 'name',
    onSendMessage: jest.fn(),
    onWalletClick: () => null,
}

function makeTextEvent(
    id: string,
    body: string,
    timestamp: number,
): MatrixEvent {
    return {
        id: id as RpcTimelineEventItemId,
        roomId: groupChatProps.id,
        timestamp,
        sender: '@alice:example.com',
        localEcho: false,
        sendState: { kind: 'sent', event_id: id },
        inReply: null,
        mentions: null,
        canReact: false,
        reactions: [],
        content: {
            msgtype: 'm.text',
            body,
            formatted: null,
        },
    }
}

function makeRoomMemberEvent(
    id: string,
    timestamp: number,
    change: MatrixEvent<'m.room.member'>['content']['change'] = 'joined',
): MatrixEvent<'m.room.member'> {
    return {
        id: id as RpcTimelineEventItemId,
        roomId: groupChatProps.id,
        timestamp,
        sender: '@alice:example.com',
        localEcho: false,
        sendState: { kind: 'sent', event_id: id },
        inReply: null,
        mentions: null,
        canReact: false,
        reactions: [],
        content: {
            msgtype: 'm.room.member',
            userId: '@alice:example.com',
            userDisplayName: 'Alice',
            change,
        },
    }
}

function storeWithEvents(events: MatrixEvent[]) {
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
    return store
}

describe('/components/Chat/ChatConversation', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('membership events', () => {
        it('should render joined room member events in group chats', async () => {
            const events = [
                makeTextEvent('$message', 'visible message', 2),
                makeRoomMemberEvent('$room-member', 1),
            ]
            const store = storeWithEvents(events)
            const { container } = renderWithProviders(
                <ChatConversation {...groupChatProps} />,
                { store },
            )

            await waitFor(() => {
                expect(screen.getByText('visible message')).toBeInTheDocument()
            })
            expect(
                screen.getByText('Alice joined the room'),
            ).toBeInTheDocument()
            expect(
                container.querySelector('[data-event-id="$room-member"]'),
            ).toBeInTheDocument()
        })

        it('should not render non-joined room member events in group chats', async () => {
            const events = [
                makeTextEvent('$message', 'visible message', 2),
                makeRoomMemberEvent('$room-member', 1, 'left'),
            ]
            const store = storeWithEvents(events)
            const { container } = renderWithProviders(
                <ChatConversation {...groupChatProps} />,
                { store },
            )

            await waitFor(() => {
                expect(screen.getByText('visible message')).toBeInTheDocument()
            })
            expect(
                screen.queryByText('Alice joined the room'),
            ).not.toBeInTheDocument()
            expect(
                container.querySelector('[data-event-id="$room-member"]'),
            ).not.toBeInTheDocument()
        })

        it('should not render room member events in direct chats', async () => {
            const events = [
                makeTextEvent('$message', 'visible message', 2),
                makeRoomMemberEvent('$room-member', 1),
            ]
            const store = storeWithEvents(events)
            const { container } = renderWithProviders(
                <ChatConversation {...directChatProps} />,
                { store },
            )

            await waitFor(() => {
                expect(screen.getByText('visible message')).toBeInTheDocument()
            })
            expect(
                screen.queryByText('Alice joined the room'),
            ).not.toBeInTheDocument()
            expect(
                container.querySelector('[data-event-id="$room-member"]'),
            ).not.toBeInTheDocument()
        })
    })
})
