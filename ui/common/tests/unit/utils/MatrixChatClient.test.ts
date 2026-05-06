import {
    RpcSerializedRoomInfo,
    RpcTimelineItemEvent,
    VectorDiff,
} from '../../../types/bindings'
import { MatrixChatClient } from '../../../utils/MatrixChatClient'
import { FedimintBridge } from '../../../utils/fedimint'

const ROOM_ID = '!room:example.com'

const flushPromises = async () => {
    await Promise.resolve()
    await Promise.resolve()
}

const makePreviewEvent = (): RpcTimelineItemEvent =>
    ({
        id: '$event',
        content: {
            msgtype: 'm.text',
            body: 'Recovered preview',
        },
        localEcho: false,
        timestamp: Date.now(),
        sender: '@alice:example.com',
        sendState: null,
        inReply: null,
        mentions: null,
    }) as RpcTimelineItemEvent

const makeRoomInfo = (
    overrides: Partial<RpcSerializedRoomInfo> = {},
): RpcSerializedRoomInfo => ({
    id: ROOM_ID,
    name: 'Recovered room',
    avatarUrl: null,
    preview: null,
    directUserId: null,
    isDirect: false,
    notificationCount: 0,
    isMarkedUnread: false,
    joinedMemberCount: 3,
    isPreview: false,
    isPublic: false,
    allowKnocking: false,
    roomState: 'joined',
    recencyStamp: 123,
    ...overrides,
})

describe('MatrixChatClient', () => {
    let client: MatrixChatClient
    let roomInfoCallback: ((room: RpcSerializedRoomInfo) => void) | undefined
    let timelineUnsubscribe: jest.Mock
    let pinnedTimelineCallbacks: Set<(updates: VectorDiff<any>[]) => void>
    let mockFedimint: Pick<
        FedimintBridge,
        | 'matrixRoomSubscribeInfo'
        | 'matrixSubscribeRoomTimelineItems'
        | 'matrixSubscribeRoomPinnedTimelineItems'
        | 'matrixRoomTimelineItemsPaginateBackwards'
        | 'matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus'
        | 'matrixRoomGetMembers'
        | 'matrixRoomGetPowerLevels'
        | 'matrixSubscribeMultispendGroup'
        | 'matrixRoomGetNotificationMode'
    >

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()

        timelineUnsubscribe = jest.fn()
        roomInfoCallback = undefined
        pinnedTimelineCallbacks = new Set()
        mockFedimint = {
            matrixRoomSubscribeInfo: jest.fn(({ callback }) => {
                roomInfoCallback = callback
                return jest.fn()
            }),
            matrixSubscribeRoomTimelineItems: jest.fn(
                () => timelineUnsubscribe,
            ),
            matrixSubscribeRoomPinnedTimelineItems: jest.fn(({ callback }) => {
                pinnedTimelineCallbacks.add(callback)
                return jest.fn(() => {
                    pinnedTimelineCallbacks.delete(callback)
                })
            }),
            matrixRoomTimelineItemsPaginateBackwards: jest
                .fn()
                .mockResolvedValue(undefined),
            matrixRoomSubscribeTimelineItemsPaginateBackwardsStatus: jest.fn(
                () => jest.fn(),
            ),
            matrixRoomGetMembers: jest.fn().mockResolvedValue([]),
            matrixRoomGetPowerLevels: jest.fn().mockResolvedValue({}),
            matrixSubscribeMultispendGroup: jest.fn(() => jest.fn()),
            matrixRoomGetNotificationMode: jest.fn().mockResolvedValue(null),
        }

        client = new MatrixChatClient()
        ;(client as unknown as { fedimint: typeof mockFedimint }).fedimint =
            mockFedimint
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    const emitPinnedTimelineUpdates = (updates: VectorDiff<any>[]) => {
        pinnedTimelineCallbacks.forEach(callback => callback(updates))
    }

    describe('preview warmups', () => {
        it('should warm active joined rooms that are missing a preview', async () => {
            await (
                client as unknown as {
                    observeRoomInfo: (roomId: string) => void
                }
            ).observeRoomInfo(ROOM_ID)

            roomInfoCallback?.(makeRoomInfo())
            await flushPromises()

            expect(
                mockFedimint.matrixSubscribeRoomTimelineItems,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    roomId: ROOM_ID,
                    callback: expect.any(Function),
                }),
            )

            jest.advanceTimersByTime(1_500)
            await flushPromises()

            expect(
                mockFedimint.matrixRoomTimelineItemsPaginateBackwards,
            ).toHaveBeenCalledWith({
                roomId: ROOM_ID,
                eventNum: 30,
            })
        })

        it('should paginate active DMs with empty previews without opening a second timeline stream', async () => {
            await (
                client as unknown as {
                    observeRoomInfo: (roomId: string) => void
                }
            ).observeRoomInfo(ROOM_ID)

            roomInfoCallback?.(
                makeRoomInfo({
                    isDirect: true,
                    directUserId: '@alice:example.com',
                    joinedMemberCount: 2,
                }),
            )
            await flushPromises()

            expect(
                mockFedimint.matrixSubscribeRoomTimelineItems,
            ).toHaveBeenCalledTimes(1)

            jest.advanceTimersByTime(1_500)
            await flushPromises()

            expect(
                mockFedimint.matrixRoomTimelineItemsPaginateBackwards,
            ).toHaveBeenCalledWith({
                roomId: ROOM_ID,
                eventNum: 30,
            })
        })

        it('should skip warm-up for rooms without activity signals', async () => {
            await (
                client as unknown as {
                    observeRoomInfo: (roomId: string) => void
                }
            ).observeRoomInfo(ROOM_ID)

            roomInfoCallback?.(
                makeRoomInfo({
                    joinedMemberCount: 1,
                    notificationCount: 0,
                    isMarkedUnread: false,
                    recencyStamp: null,
                }),
            )
            await flushPromises()

            expect(
                mockFedimint.matrixSubscribeRoomTimelineItems,
            ).not.toHaveBeenCalled()
            expect(
                mockFedimint.matrixRoomTimelineItemsPaginateBackwards,
            ).not.toHaveBeenCalled()
        })

        it('should keep an explicitly observed room timeline attached after warm-up ends', async () => {
            await (
                client as unknown as {
                    observeRoomTimeline: (
                        roomId: string,
                        reason: string,
                    ) => void
                }
            ).observeRoomTimeline(ROOM_ID, 'room')

            await (
                client as unknown as {
                    observeRoomInfo: (roomId: string) => void
                }
            ).observeRoomInfo(ROOM_ID)

            roomInfoCallback?.(makeRoomInfo())
            await flushPromises()

            expect(
                mockFedimint.matrixSubscribeRoomTimelineItems,
            ).toHaveBeenCalledTimes(1)

            roomInfoCallback?.(
                makeRoomInfo({
                    preview: makePreviewEvent(),
                }),
            )
            await flushPromises()

            expect(timelineUnsubscribe).not.toHaveBeenCalled()
            ;(
                client as unknown as {
                    unobserveRoomTimeline: (
                        roomId: string,
                        reason: string,
                    ) => void
                }
            ).unobserveRoomTimeline(ROOM_ID, 'room')

            expect(timelineUnsubscribe).toHaveBeenCalledTimes(1)
        })
    })

    describe('pinned timeline observation', () => {
        it('should emit raw pinned timeline diffs with the room id', async () => {
            const handler = jest.fn()
            const updates = [{ Reset: { values: [] } }] as VectorDiff<any>[]
            client.on('roomPinnedTimelineUpdate', handler)

            await (
                client as unknown as {
                    observeRoomPinnedTimeline: (roomId: string) => Promise<void>
                }
            ).observeRoomPinnedTimeline(ROOM_ID)

            emitPinnedTimelineUpdates(updates)

            expect(handler).toHaveBeenCalledWith({
                roomId: ROOM_ID,
                updates,
            })
        })

        it('should resume pinned updates after a pinned-only teardown without reopening the main timeline', async () => {
            const handler = jest.fn()
            const firstUpdates = [
                { Reset: { values: [] } },
            ] as VectorDiff<any>[]
            const secondUpdates = [
                { Reset: { values: [makePreviewEvent() as any] } },
            ] as VectorDiff<any>[]
            client.on('roomPinnedTimelineUpdate', handler)

            client.observeRoom(ROOM_ID)
            await flushPromises()

            emitPinnedTimelineUpdates(firstUpdates)
            expect(handler).toHaveBeenLastCalledWith({
                roomId: ROOM_ID,
                updates: firstUpdates,
            })

            handler.mockClear()
            client.unobserveRoomPinnedTimeline(ROOM_ID)
            emitPinnedTimelineUpdates(secondUpdates)

            expect(handler).not.toHaveBeenCalled()

            client.observeRoom(ROOM_ID)
            await flushPromises()

            emitPinnedTimelineUpdates(secondUpdates)

            expect(handler).toHaveBeenCalledWith({
                roomId: ROOM_ID,
                updates: secondUpdates,
            })
            expect(
                mockFedimint.matrixSubscribeRoomPinnedTimelineItems,
            ).toHaveBeenCalledTimes(2)
            expect(
                mockFedimint.matrixSubscribeRoomTimelineItems,
            ).toHaveBeenCalledTimes(1)
        })
    })
})
