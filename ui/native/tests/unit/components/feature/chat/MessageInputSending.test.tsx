import {
    DocumentPickerResponse,
    keepLocalCopy,
    pick,
} from '@react-native-documents/picker'
import { act, fireEvent, screen } from '@testing-library/react-native'
import React from 'react'
import { launchImageLibrary } from 'react-native-image-picker'

import {
    addMatrixRoomInfo,
    handleMatrixRoomListStreamUpdates,
    selectChatReplyingToMessage,
    setChatReplyingToMessage,
    setupStore,
} from '@fedi/common/redux'
import { MOCK_MATRIX_ROOM } from '@fedi/common/tests/mock-data/matrix'
import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import MessageInput, {
    MessageInputProps,
} from '../../../../../components/feature/chat/MessageInput'
import SvgImage from '../../../../../components/ui/SvgImage'
import { renderWithProviders } from '../../../../utils/render'

const ROOM_ID = '!room:test.server'

function renderRoomInput(
    onMessageSubmitted: MessageInputProps['onMessageSubmitted'],
    store = setupStore(),
) {
    store.dispatch(
        addMatrixRoomInfo({
            ...MOCK_MATRIX_ROOM,
            id: ROOM_ID,
            isPublic: false,
        }),
    )
    store.dispatch(
        handleMatrixRoomListStreamUpdates([
            { Append: { values: [{ status: 'ready', id: ROOM_ID }] } },
        ]),
    )
    return renderWithProviders(
        <MessageInput
            id={ROOM_ID}
            isPublic={false}
            onMessageSubmitted={onMessageSubmitted}
        />,
        { store, fedimint: createMockFedimintBridge() },
    )
}

describe('MessageInput pending sends', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.mocked(pick).mockReset()
        jest.mocked(keepLocalCopy).mockReset()
        jest.mocked(launchImageLibrary).mockReset()
    })

    it('keeps a document whose local copy finishes during another send', async () => {
        let finishSend!: () => void
        const pending = new Promise<void>(resolve => {
            finishSend = resolve
        })
        let finishCopy!: (
            result: Awaited<ReturnType<typeof keepLocalCopy>>,
        ) => void
        jest.mocked(keepLocalCopy).mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    finishCopy = resolve
                }),
        )
        jest.mocked(launchImageLibrary).mockResolvedValueOnce({
            assets: [
                {
                    uri: 'file:///submitted.png',
                    fileName: 'submitted.png',
                    type: 'image/png',
                    width: 1,
                    height: 1,
                },
            ],
        })
        jest.mocked(pick).mockResolvedValueOnce([
            {
                uri: 'content://pending/document',
                name: 'next.txt',
                type: 'text/plain',
                size: 16,
            } as DocumentPickerResponse,
        ])
        const onMessageSubmitted = jest.fn(
            async (
                ...args: Parameters<MessageInputProps['onMessageSubmitted']>
            ) => {
                args[3]?.('body')
                await pending
                args[1]?.forEach(attachment => args[3]?.(attachment))
            },
        )
        renderRoomInput(onMessageSubmitted)
        const picker = (name: 'Image' | 'Plus') => {
            const icon = screen
                .UNSAFE_getAllByType(SvgImage)
                .find(candidate => candidate.props.name === name)
            if (!icon) throw new Error(`Missing ${name} picker`)
            return icon
        }
        await act(async () => {
            fireEvent.press(picker('Image'))
        })
        await act(async () => {
            fireEvent.press(picker('Plus'))
        })
        expect(keepLocalCopy).toHaveBeenCalledTimes(1)
        fireEvent.changeText(
            screen.getByTestId('MessageInput-TextInput'),
            'hello',
        )
        await act(async () => {
            fireEvent.press(screen.getByTestId('MessageInput-SendButton'))
        })
        try {
            expect(onMessageSubmitted).toHaveBeenCalledTimes(1)
            await act(async () => {
                finishCopy([
                    {
                        status: 'success',
                        sourceUri: 'content://pending/document',
                        localUri: 'file:///next.txt',
                    },
                ])
            })
            expect(screen.getByText('next.txt')).toBeOnTheScreen()
        } finally {
            await act(async () => {
                finishSend()
            })
        }
        expect(screen.getByText('next.txt')).toBeOnTheScreen()
    })

    it.each(['media', 'documents'] as const)(
        'keeps the next draft and new %s selections during a pending send',
        async kind => {
            let finishSend!: () => void
            const pending = new Promise<void>(resolve => {
                finishSend = resolve
            })
            const onMessageSubmitted = jest.fn(
                async (
                    ...args: Parameters<MessageInputProps['onMessageSubmitted']>
                ) => {
                    args[3]?.('body')
                    await pending
                    args[1]?.forEach(attachment => args[3]?.(attachment))
                },
            )
            if (kind === 'media') {
                jest.mocked(launchImageLibrary).mockResolvedValueOnce({
                    assets: [
                        {
                            uri: 'file:///next.png',
                            fileName: 'next.png',
                            type: 'image/png',
                            width: 1,
                            height: 1,
                        },
                    ],
                })
            } else {
                jest.mocked(pick).mockResolvedValueOnce([
                    {
                        uri: 'file:///next.txt',
                        name: 'next.txt',
                        type: 'text/plain',
                        size: 16,
                    } as DocumentPickerResponse,
                ])
            }
            renderRoomInput(onMessageSubmitted)
            fireEvent.changeText(
                screen.getByTestId('MessageInput-TextInput'),
                'hello',
            )
            await act(async () => {
                fireEvent.press(screen.getByTestId('MessageInput-SendButton'))
            })

            try {
                expect(onMessageSubmitted).toHaveBeenCalledTimes(1)
                expect(
                    screen.getByTestId('MessageInput-TextInput').props.value,
                ).toBe('')
                fireEvent.changeText(
                    screen.getByTestId('MessageInput-TextInput'),
                    'next draft',
                )
                const picker = screen
                    .UNSAFE_getAllByType(SvgImage)
                    .find(
                        icon =>
                            icon.props.name ===
                            (kind === 'media' ? 'Image' : 'Plus'),
                    )
                if (!picker) throw new Error(`Missing ${kind} picker`)
                await act(async () => {
                    fireEvent.press(picker)
                })
                expect(
                    kind === 'media' ? launchImageLibrary : pick,
                ).toHaveBeenCalledTimes(1)
            } finally {
                await act(async () => {
                    finishSend()
                })
            }
            expect(
                screen.getByTestId('MessageInput-TextInput').props.value,
            ).toBe('next draft')
            await act(async () => {
                fireEvent.press(screen.getByTestId('MessageInput-SendButton'))
            })
            expect(onMessageSubmitted).toHaveBeenLastCalledWith(
                'next draft',
                [
                    expect.objectContaining({
                        uri:
                            kind === 'media'
                                ? 'file:///next.png'
                                : 'file:///next.txt',
                    }),
                ],
                undefined,
                expect.any(Function),
            )
        },
    )

    it('keeps a draft typed during a file-only send', async () => {
        let finishSend!: () => void
        const pending = new Promise<void>(resolve => {
            finishSend = resolve
        })
        const onMessageSubmitted = jest.fn(async () => pending)
        jest.mocked(launchImageLibrary).mockResolvedValueOnce({
            assets: [
                {
                    uri: 'file:///pending.png',
                    fileName: 'pending.png',
                    type: 'image/png',
                    width: 1,
                    height: 1,
                },
            ],
        })
        renderRoomInput(onMessageSubmitted)
        const picker = screen
            .UNSAFE_getAllByType(SvgImage)
            .find(icon => icon.props.name === 'Image')
        if (!picker) throw new Error('Missing media picker')
        await act(async () => {
            fireEvent.press(picker)
        })
        await act(async () => {
            fireEvent.press(screen.getByTestId('MessageInput-SendButton'))
        })
        try {
            expect(onMessageSubmitted).toHaveBeenCalledWith(
                '',
                [expect.objectContaining({ uri: 'file:///pending.png' })],
                undefined,
                expect.any(Function),
            )
            fireEvent.changeText(
                screen.getByTestId('MessageInput-TextInput'),
                'next draft',
            )
        } finally {
            await act(async () => {
                finishSend()
            })
        }
        expect(screen.getByTestId('MessageInput-TextInput').props.value).toBe(
            'next draft',
        )
    })

    it.each([ROOM_ID, '!other:test.server'])(
        'keeps a newer reply target in %s when the submitted body is accepted',
        async replyRoomId => {
            let acceptBody!: () => void
            let finishSend!: () => void
            const accepted = new Promise<void>(resolve => {
                acceptBody = resolve
            })
            const pending = new Promise<void>(resolve => {
                finishSend = resolve
            })
            const onMessageSubmitted = jest.fn(
                async (
                    ...args: Parameters<MessageInputProps['onMessageSubmitted']>
                ) => {
                    await accepted
                    args[3]?.('body')
                    await pending
                },
            )
            const store = setupStore()
            const submittedReply = createMockNonPaymentEvent({
                id: '$submitted-reply' as RpcTimelineEventItemId,
                roomId: ROOM_ID,
                content: { body: 'submitted target' },
            })
            const nextReply = createMockNonPaymentEvent({
                id: '$next-reply' as RpcTimelineEventItemId,
                roomId: replyRoomId,
                content: { body: 'next reply target' },
            })
            store.dispatch(
                setChatReplyingToMessage({
                    roomId: ROOM_ID,
                    event: submittedReply,
                }),
            )
            renderRoomInput(onMessageSubmitted, store)
            fireEvent.changeText(
                screen.getByTestId('MessageInput-TextInput'),
                'submitted reply',
            )
            await act(async () => {
                fireEvent.press(screen.getByTestId('MessageInput-SendButton'))
            })
            try {
                act(() => {
                    store.dispatch(
                        setChatReplyingToMessage({
                            roomId: replyRoomId,
                            event: nextReply,
                        }),
                    )
                })
                await act(async () => {
                    acceptBody()
                })
                expect(
                    selectChatReplyingToMessage(store.getState()).event?.id,
                ).toBe(nextReply.id)
                if (replyRoomId === ROOM_ID) {
                    expect(
                        screen.getByText('next reply target'),
                    ).toBeOnTheScreen()
                }
            } finally {
                await act(async () => {
                    acceptBody()
                    finishSend()
                })
            }
            expect(
                selectChatReplyingToMessage(store.getState()).event?.id,
            ).toBe(nextReply.id)
        },
    )
})
