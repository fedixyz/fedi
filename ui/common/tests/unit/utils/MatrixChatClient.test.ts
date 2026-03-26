import {
    RpcSerializedRoomInfo,
    RpcTimelineItemEvent,
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
    roomState: 'joined',
    recencyStamp: 123,
    ...overrides,
})

describe('MatrixChatClient', () => {
    let client: MatrixChatClient
    let roomInfoCallback: ((room: RpcSerializedRoomInfo) => void) | undefined
    let timelineUnsubscribe: jest.Mock
    let mockFedimint: Pick<
        FedimintBridge,
        | 'matrixRoomSubscribeInfo'
        | 'matrixSubscribeRoomTimelineItems'
        | 'matrixRoomTimelineItemsPaginateBackwards'
    >

    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers()

        timelineUnsubscribe = jest.fn()
        roomInfoCallback = undefined
        mockFedimint = {
            matrixRoomSubscribeInfo: jest.fn(({ callback }) => {
                roomInfoCallback = callback
                return jest.fn()
            }),
            matrixSubscribeRoomTimelineItems: jest.fn(
                () => timelineUnsubscribe,
            ),
            matrixRoomTimelineItemsPaginateBackwards: jest
                .fn()
                .mockResolvedValue(undefined),
        }

        client = new MatrixChatClient()
        ;(client as unknown as { fedimint: typeof mockFedimint }).fedimint =
            mockFedimint
    })

    afterEach(() => {
        jest.useRealTimers()
    })

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
})
