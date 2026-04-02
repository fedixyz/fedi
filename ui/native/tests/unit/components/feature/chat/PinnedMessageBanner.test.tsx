import {
    act,
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react-native'
import React from 'react'

import {
    handleMatrixRoomPinnedTimelineStreamUpdates,
    handleMatrixRoomTimelineStreamUpdates,
    setupStore,
} from '@fedi/common/redux'
import { createMockPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { MatrixEvent } from '@fedi/common/types'
import { RpcMsgLikeKind, RpcTimelineItem } from '@fedi/common/types/bindings'
import i18n from '@fedi/native/localization/i18n'

import PinnedMessageBanner from '../../../../../components/feature/chat/PinnedMessageBanner'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('../../../../../components/ui/SvgImage', () => {
    const { Text: RNText } = jest.requireActual('react-native')
    return {
        __esModule: true,
        default: ({ name }: { name: string }) => <RNText>{name}</RNText>,
    }
})

const ROOM_ID = '!test-room:example.com'
const USER_ID = '@alice:example.com'

function makePinnedTimelineItem(
    eventId: string,
    body: string,
    contentOverride?: RpcMsgLikeKind,
): RpcTimelineItem {
    return {
        kind: 'event' as const,
        value: {
            id: eventId as any,
            content: contentOverride ?? {
                msgtype: 'm.text',
                body,
                formatted: null,
            },
            localEcho: false,
            timestamp: Date.now(),
            sender: USER_ID,
            sendState: null,
            inReply: null,
            mentions: null,
        },
    }
}

function makeStoreWithPinnedItems(
    items: ReturnType<typeof makePinnedTimelineItem>[],
) {
    const store = setupStore()
    store.dispatch(
        handleMatrixRoomPinnedTimelineStreamUpdates({
            roomId: ROOM_ID,
            updates: [{ Reset: { values: items } }],
        }),
    )
    return store
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

function renderBanner(
    props: Partial<React.ComponentProps<typeof PinnedMessageBanner>> = {},
    store = setupStore(),
) {
    return renderWithProviders(
        <PinnedMessageBanner roomId={ROOM_ID} {...props} />,
        { store },
    )
}

describe('PinnedMessageBanner', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('should not render when there are no pinned messages', () => {
        renderBanner()

        expect(
            screen.queryByText(i18n.t('feature.chat.pinned-message')),
        ).not.toBeOnTheScreen()
    })

    it('should start by previewing the most recently pinned message and rail position', () => {
        const store = makeStoreWithPinnedItems([
            makePinnedTimelineItem('$event-1', 'Oldest pinned preview'),
            makePinnedTimelineItem('$event-2', 'Middle pinned preview'),
            makePinnedTimelineItem('$event-3', 'Newest pinned preview'),
        ])

        renderBanner({}, store)

        expect(
            screen.getByText(i18n.t('feature.chat.pinned-message')),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            'Newest pinned preview',
        )
        expect(screen.getByTestId('pinned-message-count')).toHaveTextContent(
            '3/3',
        )
    })

    it('should keep cycling through older pins when many messages are pinned', () => {
        const store = makeStoreWithPinnedItems([
            makePinnedTimelineItem('$event-1', 'Preview 1'),
            makePinnedTimelineItem('$event-2', 'Preview 2'),
            makePinnedTimelineItem('$event-3', 'Preview 3'),
            makePinnedTimelineItem('$event-4', 'Preview 4'),
            makePinnedTimelineItem('$event-5', 'Preview 5'),
            makePinnedTimelineItem('$event-6', 'Preview 6'),
            makePinnedTimelineItem('$event-7', 'Preview 7'),
        ])
        const view = renderBanner({}, store)

        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            'Preview 7',
        )
        expect(screen.getByTestId('pinned-message-count')).toHaveTextContent(
            '7/7',
        )

        view.rerender(
            <PinnedMessageBanner roomId={ROOM_ID} focusedEventId="$event-7" />,
        )

        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            'Preview 6',
        )
        expect(screen.getByTestId('pinned-message-count')).toHaveTextContent(
            '6/7',
        )

        view.rerender(
            <PinnedMessageBanner roomId={ROOM_ID} focusedEventId="$event-6" />,
        )

        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            'Preview 5',
        )
        expect(screen.getByTestId('pinned-message-count')).toHaveTextContent(
            '5/7',
        )
    })

    it('should call onPressPinnedMessage with the current event ID on press', () => {
        const store = makeStoreWithPinnedItems([
            makePinnedTimelineItem('$event-1', 'Newest pinned preview'),
        ])
        const onPress = jest.fn()

        renderBanner({ onPressPinnedMessage: onPress }, store)

        fireEvent.press(screen.getByTestId('pinned-message-banner'))

        expect(onPress).toHaveBeenCalledWith('$event-1')
    })

    it('should rotate only after focus confirmation', () => {
        const store = makeStoreWithPinnedItems([
            makePinnedTimelineItem('$event-1', 'Oldest pinned preview'),
            makePinnedTimelineItem('$event-2', 'Middle pinned preview'),
            makePinnedTimelineItem('$event-3', 'Newest pinned preview'),
        ])
        const onPress = jest.fn()
        const view = renderBanner({ onPressPinnedMessage: onPress }, store)

        fireEvent.press(screen.getByTestId('pinned-message-banner'))

        expect(onPress).toHaveBeenCalledWith('$event-3')
        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            'Newest pinned preview',
        )

        view.rerender(
            <PinnedMessageBanner
                roomId={ROOM_ID}
                focusedEventId="$event-3"
                onPressPinnedMessage={onPress}
            />,
        )

        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            'Middle pinned preview',
        )
        expect(screen.getByTestId('pinned-message-count')).toHaveTextContent(
            '2/3',
        )
    })

    it('should restore the banner when the pinned set changes after dismissal', async () => {
        const store = makeStoreWithPinnedItems([
            makePinnedTimelineItem('$event-1', 'Oldest pinned preview'),
        ])

        renderBanner({}, store)

        fireEvent.press(screen.getByTestId('pinned-message-dismiss'))

        expect(
            screen.queryByText(i18n.t('feature.chat.pinned-message')),
        ).not.toBeOnTheScreen()

        act(() => {
            store.dispatch(
                handleMatrixRoomPinnedTimelineStreamUpdates({
                    roomId: ROOM_ID,
                    updates: [
                        {
                            Reset: {
                                values: [
                                    makePinnedTimelineItem(
                                        '$event-1',
                                        'Oldest pinned preview',
                                    ),
                                    makePinnedTimelineItem(
                                        '$event-2',
                                        'Newest pinned preview',
                                    ),
                                ],
                            },
                        },
                    ],
                }),
            )
        })

        await waitFor(() => {
            expect(
                screen.getByText(i18n.t('feature.chat.pinned-message')),
            ).toBeOnTheScreen()
        })
        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            'Newest pinned preview',
        )
    })

    it('should render the private-message translation for undecryptable pinned events', () => {
        const store = makeStoreWithPinnedItems([
            makePinnedTimelineItem('$event-1', 'Encrypted preview', {
                msgtype: 'unableToDecrypt',
            }),
        ])

        renderBanner({}, store)

        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            i18n.t('feature.chat.message-private'),
        )
    })

    it('should resolve pinned payment updates onto the visible payment message', () => {
        const initialPaymentEvent = createMockPaymentEvent({
            id: '$payment-pushed' as any,
            roomId: ROOM_ID,
            content: {
                paymentId: 'payment-123',
                status: 'pushed',
                body: 'Requested payment',
            },
        })
        const acceptedPaymentEvent = createMockPaymentEvent({
            id: '$payment-accepted' as any,
            roomId: ROOM_ID,
            content: {
                paymentId: 'payment-123',
                status: 'accepted',
                body: 'Accepted payment',
            },
        })
        const store = setupStore()
        const onPressPinnedMessage = jest.fn()

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

        renderBanner({ onPressPinnedMessage }, store)

        expect(
            screen.getByText(i18n.t('feature.chat.pinned-message')),
        ).toBeOnTheScreen()
        fireEvent.press(screen.getByTestId('pinned-message-banner'))
        expect(onPressPinnedMessage).toHaveBeenCalledWith(
            initialPaymentEvent.id,
        )
    })

    it('should hide pinned events that do not render in the conversation', () => {
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
        const store = setupStore()

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

        renderBanner({}, store)

        expect(
            screen.queryByText(i18n.t('feature.chat.pinned-message')),
        ).not.toBeOnTheScreen()
    })

    it('should stay visible for pinned events with unknown content after a cold load', () => {
        const store = makeStoreWithPinnedItems([
            makePinnedTimelineItem('$event-1', 'Hidden preview', {
                msgtype: 'unknown',
            }),
        ])

        renderBanner({}, store)

        expect(
            screen.getByText(i18n.t('feature.chat.pinned-message')),
        ).toBeOnTheScreen()
        expect(screen.getByTestId('pinned-message-preview')).toHaveTextContent(
            i18n.t('feature.chat.new-message'),
        )
    })
})
