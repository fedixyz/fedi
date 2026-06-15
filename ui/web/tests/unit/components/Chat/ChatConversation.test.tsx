import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    handleMatrixRoomTimelineStreamUpdates,
    setFeatureFlags,
    setMatrixAuth,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import {
    ChatType,
    MatrixAuth,
    MatrixEvent,
    MatrixRoomMember,
} from '@fedi/common/types'
import {
    FeatureCatalog,
    RpcTimelineEventItemId,
} from '@fedi/common/types/bindings'

import { ChatConversation } from '../../../../src/components/Chat/ChatConversation'
import i18n from '../../../../src/localization/i18n'
import { renderWithProviders } from '../../../utils/render'

const ROOM_ID = '2'
const SELF_ID = '@self:example.com'
const ALICE_ID = '@alice:example.com'
const BOB_ID = '@bob:example.com'

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
    overrides: Pick<Partial<MatrixEvent>, 'canReact' | 'reactions'> = {},
): MatrixEvent {
    return {
        id: id as RpcTimelineEventItemId,
        roomId: groupChatProps.id,
        timestamp,
        sender: ALICE_ID,
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
        ...overrides,
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

function storeWithReactableEvent(event: MatrixEvent) {
    const store = storeWithEvents([event])
    store.dispatch(
        setMatrixAuth({
            userId: SELF_ID,
            deviceId: 'device-1',
        } as MatrixAuth),
    )
    store.dispatch(
        setFeatureFlags({
            message_reactions: {},
        } as FeatureCatalog),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: [
                {
                    id: SELF_ID,
                    displayName: 'Self',
                    avatarUrl: undefined,
                    powerLevel: { type: 'int', value: 0 },
                    roomId: ROOM_ID,
                    membership: 'join',
                    ignored: false,
                } as MatrixRoomMember,
                {
                    id: ALICE_ID,
                    displayName: 'Alice',
                    avatarUrl: undefined,
                    powerLevel: { type: 'int', value: 0 },
                    roomId: ROOM_ID,
                    membership: 'join',
                    ignored: false,
                } as MatrixRoomMember,
                {
                    id: BOB_ID,
                    displayName: 'Bob',
                    avatarUrl: undefined,
                    powerLevel: { type: 'int', value: 0 },
                    roomId: ROOM_ID,
                    membership: 'join',
                    ignored: false,
                } as MatrixRoomMember,
            ],
        }),
    )
    return store
}

function renderReactableConversation(event: MatrixEvent) {
    const toggleReaction = jest.fn().mockResolvedValue(true)
    renderWithProviders(<ChatConversation {...groupChatProps} />, {
        store: storeWithReactableEvent(event),
        fedimint: createMockFedimintBridge({
            getMatrixClient: () => ({ toggleReaction }),
        } as any),
    })

    return { toggleReaction }
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

    describe('reactions', () => {
        it('should show reaction details for a selected reaction chip', async () => {
            const event = makeTextEvent('$reaction', 'reactable message', 1, {
                canReact: true,
                reactions: [
                    {
                        key: '👍',
                        count: 2,
                        userIds: [ALICE_ID, SELF_ID],
                    },
                ],
            })

            renderReactableConversation(event)

            await userEvent.click(
                await screen.findByLabelText('👍 reaction, 2, reacted by you'),
            )

            expect(
                screen.getByLabelText('👍 reaction by Alice'),
            ).toBeInTheDocument()
            expect(
                screen.getByText(i18n.t('feature.chat.reaction-you')),
            ).toBeInTheDocument()
        })

        it('should close reaction details when removing the only reaction', async () => {
            const event = makeTextEvent('$reaction', 'reactable message', 1, {
                canReact: true,
                reactions: [
                    {
                        key: '👍',
                        count: 1,
                        userIds: [SELF_ID],
                    },
                ],
            })
            const { toggleReaction } = renderReactableConversation(event)

            await userEvent.click(
                await screen.findByLabelText('👍 reaction, reacted by you'),
            )
            await userEvent.click(
                screen.getByLabelText('👍 reaction by you, tap to remove'),
            )

            expect(toggleReaction).toHaveBeenCalledWith(ROOM_ID, event.id, '👍')
            expect(
                screen.queryByText(i18n.t('feature.chat.reaction-you')),
            ).not.toBeInTheDocument()
        })

        it('should select another reaction when the removed reaction drops to zero', async () => {
            const event = makeTextEvent('$reaction', 'reactable message', 1, {
                canReact: true,
                reactions: [
                    {
                        key: '👍',
                        count: 1,
                        userIds: [SELF_ID],
                    },
                    {
                        key: '🎉',
                        count: 1,
                        userIds: [ALICE_ID],
                    },
                ],
            })
            const { toggleReaction } = renderReactableConversation(event)

            await userEvent.click(
                await screen.findByLabelText('👍 reaction, reacted by you'),
            )
            await userEvent.click(
                screen.getByLabelText('👍 reaction by you, tap to remove'),
            )

            expect(toggleReaction).toHaveBeenCalledWith(ROOM_ID, event.id, '👍')
            expect(
                screen.getByLabelText('🎉 reaction by Alice'),
            ).toBeInTheDocument()
            expect(
                screen.queryByText(i18n.t('feature.chat.reaction-you')),
            ).not.toBeInTheDocument()
        })

        it('should keep the selected reaction when removing one of multiple users', async () => {
            const event = makeTextEvent('$reaction', 'reactable message', 1, {
                canReact: true,
                reactions: [
                    {
                        key: '👍',
                        count: 2,
                        userIds: [SELF_ID, BOB_ID],
                    },
                    {
                        key: '🎉',
                        count: 1,
                        userIds: [ALICE_ID],
                    },
                ],
            })
            const { toggleReaction } = renderReactableConversation(event)

            await userEvent.click(
                await screen.findByLabelText('👍 reaction, 2, reacted by you'),
            )
            await userEvent.click(
                screen.getByLabelText('👍 reaction by you, tap to remove'),
            )

            expect(toggleReaction).toHaveBeenCalledWith(ROOM_ID, event.id, '👍')
            expect(
                screen.getByLabelText('👍 reaction by Bob'),
            ).toBeInTheDocument()
            expect(
                screen.getByText(i18n.t('feature.chat.reaction-you')),
            ).toBeInTheDocument()
            expect(
                screen.queryByLabelText('👍 reaction by Alice'),
            ).not.toBeInTheDocument()
        })
    })
})
