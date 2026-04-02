import { act, waitFor } from '@testing-library/react'

import { usePinMessage } from '@fedi/common/hooks/matrix'
import {
    handleMatrixRoomPinnedTimelineStreamUpdates,
    handleMatrixRoomTimelineStreamUpdates,
    selectMatrixRoomPinnedEvents,
    selectMatrixRoomPinnedEventIds,
    selectMatrixRoomPinnedRawEventIdsForVisibleEvent,
    setMatrixAuth,
    setMatrixRoomMembers,
    setMatrixRoomPowerLevels,
    setupStore,
} from '@fedi/common/redux'
import {
    MatrixAuth,
    MatrixEvent,
    MatrixPowerLevel,
    MatrixRoomMember,
} from '@fedi/common/types'
import { RpcTimelineItem } from '@fedi/common/types/bindings'

import {
    createMockNonPaymentEvent,
    createMockPaymentEvent,
} from '../../mock-data/matrix-event'
import {
    createMockFedimintBridge,
    MockFedimintBridge,
} from '../../utils/fedimint'
import { renderHookWithState } from '../../utils/render'
import { createMockT } from '../../utils/setup'

const ROOM_ID = '!test-room:example.com'
const EVENT_ID = '$event-123'
const USER_ID = '@user1:example.com'

function makeTimelineItem(eventId: string): RpcTimelineItem {
    return {
        kind: 'event',
        value: {
            id: eventId as any,
            content: {
                msgtype: 'm.text',
                body: `msg ${eventId}`,
                formatted: null,
            } as any,
            localEcho: false,
            timestamp: Date.now(),
            sender: USER_ID,
            sendState: null,
            inReply: null,
            mentions: null,
        },
    }
}

function makeUnknownTimelineItem(eventId: string): RpcTimelineItem {
    return {
        kind: 'event',
        value: {
            id: eventId as any,
            content: {
                msgtype: 'unknown',
            } as any,
            localEcho: false,
            timestamp: Date.now(),
            sender: USER_ID,
            sendState: null,
            inReply: null,
            mentions: null,
        },
    }
}

function makeTimelineItemFromEvent(event: MatrixEvent): RpcTimelineItem {
    const value = Object.fromEntries(
        Object.entries(event).filter(([key]) => key !== 'roomId'),
    ) as Omit<MatrixEvent, 'roomId'>

    return {
        kind: 'event',
        value,
    } as RpcTimelineItem
}

function setRoomTimeline(
    store: ReturnType<typeof setupStore>,
    events: MatrixEvent[],
) {
    store.dispatch(
        handleMatrixRoomTimelineStreamUpdates({
            roomId: ROOM_ID,
            updates: [{ Clear: {} }, { Append: { values: events } }],
        }),
    )
}

function addVisibleRoomEvent(
    store: ReturnType<typeof setupStore>,
    eventId: string = EVENT_ID,
) {
    setRoomTimeline(store, [
        createMockNonPaymentEvent({
            id: eventId as any,
            roomId: ROOM_ID,
        }),
    ])
}

function setupStoreWithAuth(
    store: ReturnType<typeof setupStore>,
    powerLevel: number = MatrixPowerLevel.Moderator,
) {
    store.dispatch(setMatrixAuth({ userId: USER_ID } as MatrixAuth))
    store.dispatch(
        setMatrixRoomMembers({
            roomId: ROOM_ID,
            members: [
                {
                    id: USER_ID,
                    displayName: 'User 1',
                    avatarUrl: undefined,
                    powerLevel: { type: 'int', value: powerLevel },
                    roomId: ROOM_ID,
                    membership: 'join',
                    ignored: false,
                } as MatrixRoomMember,
            ],
        }),
    )
    store.dispatch(
        setMatrixRoomPowerLevels({
            roomId: ROOM_ID,
            powerLevels: {
                state_default: MatrixPowerLevel.Moderator,
            },
        }),
    )
}

describe('usePinMessage', () => {
    let store: ReturnType<typeof setupStore>
    let mockFedimint: MockFedimintBridge
    const t = createMockT()

    beforeEach(() => {
        jest.clearAllMocks()
        store = setupStore()
        mockFedimint = createMockFedimintBridge({
            matrixRoomPinMessage: Promise.resolve(null),
            matrixRoomUnpinMessage: Promise.resolve(null),
        })
    })

    it.each([
        {
            label: 'allow pinning when user has moderator power level',
            powerLevel: MatrixPowerLevel.Moderator,
            expectedCanPin: true,
        },
        {
            label: 'allow pinning when user has admin power level',
            powerLevel: MatrixPowerLevel.Admin,
            expectedCanPin: true,
        },
        {
            label: 'not allow pinning when user has member power level',
            powerLevel: MatrixPowerLevel.Member,
            expectedCanPin: false,
        },
    ])('should $label', ({ powerLevel, expectedCanPin }) => {
        setupStoreWithAuth(store, powerLevel)
        addVisibleRoomEvent(store)

        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: EVENT_ID,
                }),
            store,
            mockFedimint,
        )

        expect(result.current.canPin).toBe(expectedCanPin)
    })

    it('should report isPinned when event is in pinned list', () => {
        setupStoreWithAuth(store)
        store.dispatch(
            handleMatrixRoomPinnedTimelineStreamUpdates({
                roomId: ROOM_ID,
                updates: [{ Reset: { values: [makeTimelineItem(EVENT_ID)] } }],
            }),
        )

        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: EVENT_ID,
                }),
            store,
            mockFedimint,
        )

        expect(result.current.isPinned).toBe(true)
    })

    it('should report not pinned when event is not in pinned list', () => {
        setupStoreWithAuth(store)
        store.dispatch(
            handleMatrixRoomPinnedTimelineStreamUpdates({
                roomId: ROOM_ID,
                updates: [
                    { Reset: { values: [makeTimelineItem('$other-event')] } },
                ],
            }),
        )

        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: EVENT_ID,
                }),
            store,
            mockFedimint,
        )

        expect(result.current.isPinned).toBe(false)
    })

    it('should report not pinned when eventId is null', () => {
        setupStoreWithAuth(store)

        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: null,
                }),
            store,
            mockFedimint,
        )

        expect(result.current.isPinned).toBe(false)
    })

    it('should treat a visible payment message as pinned when a later payment update is pinned', async () => {
        setupStoreWithAuth(store)

        const initialPaymentEvent = createMockPaymentEvent({
            id: '$payment-pushed' as any,
            roomId: ROOM_ID,
            content: {
                paymentId: 'payment-123',
                status: 'pushed',
            },
        })
        const acceptedPaymentEvent = createMockPaymentEvent({
            id: '$payment-accepted' as any,
            roomId: ROOM_ID,
            content: {
                paymentId: 'payment-123',
                status: 'accepted',
            },
        })

        setRoomTimeline(store, [initialPaymentEvent, acceptedPaymentEvent])
        store.dispatch(
            handleMatrixRoomPinnedTimelineStreamUpdates({
                roomId: ROOM_ID,
                updates: [
                    {
                        Reset: {
                            values: [
                                makeTimelineItemFromEvent(acceptedPaymentEvent),
                            ],
                        },
                    },
                ],
            }),
        )

        const onSuccess = jest.fn()
        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: initialPaymentEvent.id,
                    onSuccess,
                }),
            store,
            mockFedimint,
        )

        expect(result.current.isPinned).toBe(true)
        expect(
            selectMatrixRoomPinnedEvents(store.getState(), ROOM_ID).map(
                event => event.id,
            ),
        ).toEqual([initialPaymentEvent.id])
        expect(
            selectMatrixRoomPinnedRawEventIdsForVisibleEvent(
                store.getState(),
                ROOM_ID,
                initialPaymentEvent.id,
            ),
        ).toEqual([acceptedPaymentEvent.id])

        await act(async () => {
            await result.current.unpinMessage()
        })

        expect(mockFedimint.matrixRoomUnpinMessage).toHaveBeenCalledWith({
            roomId: ROOM_ID,
            eventId: acceptedPaymentEvent.id,
        })
        expect(onSuccess).toHaveBeenCalled()
    })

    it('should not call pin RPC when eventId is missing', async () => {
        setupStoreWithAuth(store)

        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: null,
                }),
            store,
            mockFedimint,
        )

        await act(async () => {
            await result.current.pinMessage()
        })

        expect(mockFedimint.matrixRoomPinMessage).not.toHaveBeenCalled()
    })

    it('should not allow pinning events that do not render in the conversation timeline', async () => {
        setupStoreWithAuth(store)

        const hiddenSpTransferEvent = {
            id: '$hidden-sp-transfer' as any,
            roomId: ROOM_ID,
            timestamp: Date.now(),
            localEcho: false,
            sender: USER_ID,
            sendState: null,
            inReply: null,
            mentions: null,
            content: {
                msgtype: 'spTransfer' as const,
                shouldRender: false,
            },
        } satisfies MatrixEvent<'spTransfer'>

        setRoomTimeline(store, [hiddenSpTransferEvent])

        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: hiddenSpTransferEvent.id,
                }),
            store,
            mockFedimint,
        )

        expect(result.current.canPin).toBe(false)

        await act(async () => {
            await result.current.pinMessage()
        })

        expect(mockFedimint.matrixRoomPinMessage).not.toHaveBeenCalled()
    })

    it('should respect custom pin event power level from room power levels', () => {
        setupStoreWithAuth(store, MatrixPowerLevel.Moderator)
        addVisibleRoomEvent(store)
        // Override power levels to require Admin for pinning
        store.dispatch(
            setMatrixRoomPowerLevels({
                roomId: ROOM_ID,
                powerLevels: {
                    state_default: MatrixPowerLevel.Moderator,
                    events: {
                        'm.room.pinned_events': MatrixPowerLevel.Admin,
                    },
                },
            }),
        )

        const { result } = renderHookWithState(
            () =>
                usePinMessage({
                    t,
                    roomId: ROOM_ID,
                    eventId: EVENT_ID,
                }),
            store,
            mockFedimint,
        )

        // Moderator should not be able to pin when Admin is required
        expect(result.current.canPin).toBe(false)
    })

    describe('pinned event resolution', () => {
        it('should derive pinned events and IDs from reducer-managed timeline items', async () => {
            const items = [
                makeTimelineItem('$event-1'),
                makeTimelineItem('$event-2'),
            ]

            store.dispatch(
                handleMatrixRoomPinnedTimelineStreamUpdates({
                    roomId: ROOM_ID,
                    updates: [{ Reset: { values: items } }],
                }),
            )

            await waitFor(() => {
                expect(
                    selectMatrixRoomPinnedEvents(store.getState(), ROOM_ID).map(
                        event => event.id,
                    ),
                ).toEqual(['$event-1', '$event-2'])
                expect(
                    selectMatrixRoomPinnedEventIds(store.getState(), ROOM_ID),
                ).toEqual(['$event-1', '$event-2'])
            })
        })

        it('should resolve pinned payment updates onto the visible consolidated payment event', () => {
            const initialPaymentEvent = createMockPaymentEvent({
                id: '$payment-pushed' as any,
                roomId: ROOM_ID,
                content: {
                    paymentId: 'payment-123',
                    status: 'pushed',
                },
            })
            const acceptedPaymentEvent = createMockPaymentEvent({
                id: '$payment-accepted' as any,
                roomId: ROOM_ID,
                content: {
                    paymentId: 'payment-123',
                    status: 'accepted',
                },
            })

            setRoomTimeline(store, [initialPaymentEvent, acceptedPaymentEvent])
            store.dispatch(
                handleMatrixRoomPinnedTimelineStreamUpdates({
                    roomId: ROOM_ID,
                    updates: [
                        {
                            Reset: {
                                values: [
                                    makeTimelineItemFromEvent(
                                        acceptedPaymentEvent,
                                    ),
                                ],
                            },
                        },
                    ],
                }),
            )

            expect(
                selectMatrixRoomPinnedEvents(store.getState(), ROOM_ID).map(
                    event => event.id,
                ),
            ).toEqual([initialPaymentEvent.id])
            expect(
                selectMatrixRoomPinnedEventIds(store.getState(), ROOM_ID),
            ).toEqual([initialPaymentEvent.id])
        })

        it('should ignore non-event pinned timeline items', () => {
            store.dispatch(
                handleMatrixRoomPinnedTimelineStreamUpdates({
                    roomId: ROOM_ID,
                    updates: [
                        {
                            Reset: {
                                values: [
                                    { kind: 'readMarker' },
                                    makeTimelineItem('$event-1'),
                                ],
                            },
                        },
                    ],
                }),
            )

            expect(
                selectMatrixRoomPinnedEvents(store.getState(), ROOM_ID),
            ).toHaveLength(1)
            expect(
                selectMatrixRoomPinnedEventIds(store.getState(), ROOM_ID),
            ).toEqual(['$event-1'])
        })

        it('should retain unknown pinned timeline events so pinned placeholders still count', () => {
            store.dispatch(
                handleMatrixRoomPinnedTimelineStreamUpdates({
                    roomId: ROOM_ID,
                    updates: [
                        {
                            Reset: {
                                values: [
                                    makeUnknownTimelineItem('$unknown-event'),
                                    makeTimelineItem('$event-1'),
                                ],
                            },
                        },
                    ],
                }),
            )

            expect(
                selectMatrixRoomPinnedEvents(store.getState(), ROOM_ID),
            ).toHaveLength(2)
            expect(
                selectMatrixRoomPinnedEventIds(store.getState(), ROOM_ID),
            ).toEqual(['$unknown-event', '$event-1'])
        })

        it('should drop raw pinned events that are filtered out of the visible conversation', () => {
            const hiddenSpTransferEvent = {
                id: '$hidden-sp-transfer' as any,
                roomId: ROOM_ID,
                timestamp: Date.now(),
                localEcho: false,
                sender: USER_ID,
                sendState: null,
                inReply: null,
                mentions: null,
                content: {
                    msgtype: 'spTransfer' as const,
                    shouldRender: false,
                },
            } satisfies MatrixEvent<'spTransfer'>

            setRoomTimeline(store, [hiddenSpTransferEvent])
            store.dispatch(
                handleMatrixRoomPinnedTimelineStreamUpdates({
                    roomId: ROOM_ID,
                    updates: [
                        {
                            Reset: {
                                values: [
                                    makeTimelineItemFromEvent(
                                        hiddenSpTransferEvent,
                                    ),
                                ],
                            },
                        },
                    ],
                }),
            )

            expect(
                selectMatrixRoomPinnedEvents(store.getState(), ROOM_ID),
            ).toEqual([])
            expect(
                selectMatrixRoomPinnedEventIds(store.getState(), ROOM_ID),
            ).toEqual([])
        })
    })
})
