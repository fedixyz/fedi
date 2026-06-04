import {
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import {
    handleMatrixRoomTimelineStreamUpdates,
    setFeatureFlags,
    setMatrixAuth,
    setMatrixRoomMembers,
    setupStore,
} from '@fedi/common/redux'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { MatrixAuth, MatrixEvent, MatrixPowerLevel } from '@fedi/common/types'
import {
    FeatureCatalog,
    RpcTimelineEventItemId,
} from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import ChatEvent from '../../../../../components/feature/chat/ChatEvent'
import { renderWithProviders } from '../../../../utils/render'

const roomMemberEvent = (
    change: MatrixEvent<'m.room.member'>['content']['change'],
): MatrixEvent<'m.room.member'> => ({
    id: '$room-member-event' as RpcTimelineEventItemId,
    roomId: '!room:test',
    timestamp: 1750083034389,
    localEcho: false,
    sender: '@alice:test',
    sendState: { kind: 'sent', event_id: 'event123' },
    inReply: null,
    mentions: null,
    canReact: false,
    reactions: [],
    content: {
        msgtype: 'm.room.member',
        userId: '@alice:test',
        userDisplayName: 'Alice',
        change,
    },
})

const textEvent = (
    reactions: MatrixEvent<'m.text'>['reactions'],
): MatrixEvent<'m.text'> => ({
    id: '$text-event' as RpcTimelineEventItemId,
    roomId: '!room:test',
    timestamp: 1750083034389,
    localEcho: false,
    sender: '@alice:test',
    sendState: { kind: 'sent', event_id: 'event123' },
    inReply: null,
    mentions: null,
    canReact: true,
    reactions,
    content: {
        msgtype: 'm.text',
        body: 'Hello with reactions',
        formatted: null,
    },
})

const makeStore = () => {
    const store = setupStore()
    store.dispatch(
        setFeatureFlags({
            message_reactions: {},
        } as FeatureCatalog),
    )
    store.dispatch(
        setMatrixAuth({
            userId: '@self:test',
            deviceId: 'device-1',
        } as MatrixAuth),
    )
    store.dispatch(
        setMatrixRoomMembers({
            roomId: '!room:test',
            members: [
                {
                    id: '@self:test',
                    displayName: 'Self User',
                    avatarUrl: undefined,
                    powerLevel: {
                        type: 'int',
                        value: MatrixPowerLevel.Member,
                    },
                    roomId: '!room:test',
                    membership: 'join',
                    ignored: false,
                },
                {
                    id: '@alice:test',
                    displayName: 'Alice',
                    avatarUrl: undefined,
                    powerLevel: {
                        type: 'int',
                        value: MatrixPowerLevel.Member,
                    },
                    roomId: '!room:test',
                    membership: 'join',
                    ignored: false,
                },
            ],
        }),
    )
    return store
}

describe('ChatEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should render joined membership events as a system notice', () => {
        renderWithProviders(<ChatEvent event={roomMemberEvent('joined')} />)

        expect(
            screen.getByText(
                i18n.t('feature.chat.member-joined', { user: 'Alice' }),
            ),
        ).toBeOnTheScreen()
    })

    it('should render accepted invitation membership events as a system notice', () => {
        renderWithProviders(
            <ChatEvent event={roomMemberEvent('invitationAccepted')} />,
        )

        expect(
            screen.getByText(
                i18n.t('feature.chat.member-joined', { user: 'Alice' }),
            ),
        ).toBeOnTheScreen()
    })

    it('should not render other membership events', () => {
        renderWithProviders(<ChatEvent event={roomMemberEvent('left')} />)

        expect(
            screen.queryByText(
                i18n.t('feature.chat.member-joined', { user: 'Alice' }),
            ),
        ).toBeNull()
    })

    it('renders message reactions with counts and the add control', () => {
        renderWithProviders(
            <ChatEvent
                event={textEvent([
                    {
                        key: '👀',
                        count: 1,
                        userIds: ['@alice:test'],
                    },
                    {
                        key: '😐',
                        count: 2,
                        userIds: ['@self:test', '@alice:test'],
                    },
                ])}
            />,
            { store: makeStore() },
        )

        expect(screen.getByText('👀')).toBeOnTheScreen()
        expect(screen.getByText('😐')).toBeOnTheScreen()
        expect(screen.getByText('2')).toBeOnTheScreen()
        expect(
            screen.getByLabelText('😐 reaction, 2, reacted by you'),
        ).toBeOnTheScreen()
        expect(screen.getByLabelText('add reaction')).toBeOnTheScreen()
    })

    it('hides the add reaction control when the event cannot be reacted to', () => {
        const event = textEvent([
            {
                key: '👀',
                count: 1,
                userIds: ['@alice:test'],
            },
        ])
        event.canReact = false

        renderWithProviders(<ChatEvent event={event} />, {
            store: makeStore(),
        })

        expect(screen.getByLabelText('message reactions')).toBeOnTheScreen()
        expect(screen.queryByLabelText('add reaction')).toBeNull()
    })

    it('hides message reactions when the feature flag is disabled', () => {
        const store = makeStore()
        store.dispatch(
            setFeatureFlags({
                message_reactions: null,
            } as FeatureCatalog),
        )

        renderWithProviders(
            <ChatEvent
                event={textEvent([
                    {
                        key: '👀',
                        count: 1,
                        userIds: ['@alice:test'],
                    },
                ])}
            />,
            { store },
        )

        expect(screen.getByText('Hello with reactions')).toBeOnTheScreen()
        expect(screen.queryByLabelText('message reactions')).toBeNull()
        expect(screen.queryByLabelText('add reaction')).toBeNull()
    })

    it('does not render reactions when runtime event data omits them', () => {
        const event = textEvent([])
        delete (event as Partial<MatrixEvent<'m.text'>>).reactions

        renderWithProviders(<ChatEvent event={event} />, {
            store: makeStore(),
        })

        expect(screen.getByText('Hello with reactions')).toBeOnTheScreen()
        expect(screen.queryByLabelText('message reactions')).toBeNull()
    })

    it('limits reaction chips to seven distinct emojis', () => {
        renderWithProviders(
            <ChatEvent
                event={textEvent(
                    ['👍', '😄', '🎉', '😐', '❤️', '🚀', '👀', '✨'].map(
                        key => ({
                            key,
                            count: 1,
                            userIds: ['@alice:test'],
                        }),
                    ),
                )}
            />,
            { store: makeStore() },
        )

        expect(screen.getByText('👍')).toBeOnTheScreen()
        expect(screen.getByText('👀')).toBeOnTheScreen()
        expect(screen.queryByText('✨')).toBeNull()
    })

    it('keeps reaction details open when removing your reaction does not clear the emoji', async () => {
        const event = textEvent([
            {
                key: '😐',
                count: 2,
                userIds: ['@alice:test', '@self:test'],
            },
        ])
        const store = makeStore()
        const toggleReaction = jest.fn().mockResolvedValue(true)
        const fedimint = createMockFedimintBridge({
            getMatrixClient: () => ({ toggleReaction }),
        } as any)

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: event.roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )

        renderWithProviders(<ChatEvent event={event} />, {
            store,
            fedimint,
        })

        fireEvent.press(screen.getByLabelText('😐 reaction, 2, reacted by you'))

        expect(screen.getByText('You')).toBeOnTheScreen()
        expect(screen.getByText('Tap to remove')).toBeOnTheScreen()
        expect(screen.getByText('Alice')).toBeOnTheScreen()

        fireEvent.press(
            screen.getByLabelText('😐 reaction by you, tap to remove'),
        )

        await waitFor(() => {
            expect(toggleReaction).toHaveBeenCalledWith(
                event.roomId,
                event.id,
                '😐',
            )
        })
        expect(screen.getByText('Tap to remove')).toBeOnTheScreen()
    })

    it('closes reaction details when removing your reaction clears the only emoji', async () => {
        const event = textEvent([
            {
                key: '😐',
                count: 1,
                userIds: ['@self:test'],
            },
        ])
        const store = makeStore()
        const toggleReaction = jest.fn().mockResolvedValue(true)
        const fedimint = createMockFedimintBridge({
            getMatrixClient: () => ({ toggleReaction }),
        } as any)

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: event.roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )

        renderWithProviders(<ChatEvent event={event} />, {
            store,
            fedimint,
        })

        fireEvent.press(screen.getByLabelText('😐 reaction, reacted by you'))
        fireEvent.press(
            screen.getByLabelText('😐 reaction by you, tap to remove'),
        )

        await waitFor(() => {
            expect(toggleReaction).toHaveBeenCalledWith(
                event.roomId,
                event.id,
                '😐',
            )
            expect(screen.queryByText('Tap to remove')).toBeNull()
        })
    })

    it('keeps reaction details open when removing your reaction fails', async () => {
        const event = textEvent([
            {
                key: '😐',
                count: 1,
                userIds: ['@self:test'],
            },
        ])
        const store = makeStore()
        const toggleReaction = jest.fn().mockRejectedValue(new Error('failed'))
        const fedimint = createMockFedimintBridge({
            getMatrixClient: () => ({ toggleReaction }),
        } as any)

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: event.roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )

        renderWithProviders(<ChatEvent event={event} />, {
            store,
            fedimint,
        })

        fireEvent.press(screen.getByLabelText('😐 reaction, reacted by you'))
        fireEvent.press(
            screen.getByLabelText('😐 reaction by you, tap to remove'),
        )

        await waitFor(() => {
            expect(toggleReaction).toHaveBeenCalledWith(
                event.roomId,
                event.id,
                '😐',
            )
            expect(screen.getByText('Tap to remove')).toBeOnTheScreen()
        })
    })

    it('keeps rendering reaction details when the selected emoji disappears before the drawer state updates', () => {
        const event = textEvent([
            {
                key: '😐',
                count: 1,
                userIds: ['@self:test'],
            },
            {
                key: '👀',
                count: 1,
                userIds: ['@alice:test'],
            },
        ])
        const updatedEvent = textEvent([
            {
                key: '👀',
                count: 1,
                userIds: ['@alice:test'],
            },
        ])

        const { rerender } = renderWithProviders(<ChatEvent event={event} />, {
            store: makeStore(),
        })

        fireEvent.press(screen.getByLabelText('😐 reaction, reacted by you'))
        expect(screen.getByText('You')).toBeOnTheScreen()

        rerender(<ChatEvent event={updatedEvent} />)

        expect(screen.getByText('Alice')).toBeOnTheScreen()
        expect(screen.queryByText('Tap to remove')).toBeNull()
    })

    it('opens the emoji picker from the add reaction control and selects an additional reaction', async () => {
        const event = textEvent([
            {
                key: '😐',
                count: 1,
                userIds: ['@alice:test'],
            },
        ])
        const store = makeStore()
        const toggleReaction = jest.fn().mockResolvedValue(true)
        const fedimint = createMockFedimintBridge({
            getMatrixClient: () => ({ toggleReaction }),
        } as any)

        store.dispatch(
            handleMatrixRoomTimelineStreamUpdates({
                roomId: event.roomId,
                updates: [{ Append: { values: [event] } }],
            }),
        )

        renderWithProviders(<ChatEvent event={event} />, {
            store,
            fedimint,
        })

        fireEvent.press(screen.getByLabelText('add reaction'))
        fireEvent.changeText(screen.getByLabelText('search emoji'), 'sparkles')
        fireEvent.press(screen.getByLabelText('react with ✨'))

        await waitFor(() => {
            expect(toggleReaction).toHaveBeenCalledWith(
                event.roomId,
                event.id,
                '✨',
            )
        })
    })
})
