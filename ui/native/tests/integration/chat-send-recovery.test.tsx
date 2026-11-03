import { DocumentPickerResponse, pick } from '@react-native-documents/picker'
import {
    act,
    cleanupAsync,
    fireEvent,
    waitFor,
} from '@testing-library/react-native'
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { launchImageLibrary } from 'react-native-image-picker'

import { useObserveMatrixRoom } from '@fedi/common/hooks/matrix'
import {
    inviteUserToMatrixRoom,
    selectMatrixAuth,
    selectMatrixRoomEvents,
    selectReplyingToMessageEventForRoom,
    sendMatrixMessage,
    setChatReplyingToMessage,
} from '@fedi/common/redux'
import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'
import { FedimintBridge } from '@fedi/common/utils/fedimint'

import SvgImage from '../../components/ui/SvgImage'
import ChatRoomConversation, { Props } from '../../screens/ChatRoomConversation'
import { mockRoute, mockToast } from '../setup/jest.setup.mocks'
import { renderWithBridge } from '../utils/render'

jest.mock('react-native-gesture-handler', () => ({
    ScrollView: jest.requireActual('react-native').ScrollView,
    Swipeable: jest.requireActual('react-native').View,
}))

function ObserveRoom({ roomId }: { roomId: string }) {
    useObserveMatrixRoom(roomId)
    return null
}

describe.each([
    ['message', 'document'],
    ['reply', 'document'],
    ['message', 'image'],
])('native %s retry with %s', (messageType, attachmentType) => {
    let cancellations: jest.SpiedFunction<FedimintBridge['streamCancel']>[] = []
    afterEach(async () => {
        await cleanupAsync()
        await Promise.all(
            cancellations.flatMap(spy =>
                spy.mock.results.map(result => result.value),
            ),
        )
    })

    const senderBuilder = createIntegrationTestBuilder(waitFor)
    const receiverBuilder = createIntegrationTestBuilder(waitFor)
    const sender = senderBuilder.getContext()
    const receiver = receiverBuilder.getContext()
    let directory: string

    beforeEach(() => {
        cancellations = [sender, receiver].map(context =>
            jest.spyOn(context.bridge.fedimint, 'streamCancel'),
        )
    })

    afterEach(async () => {
        if (directory) await rm(directory, { recursive: true, force: true })
    })

    it('delivers the body and each attachment exactly once after a later file fails', async () => {
        await senderBuilder.withChatReady()
        await receiverBuilder.withChatReady()
        const roomId = await senderBuilder.withChatGroupCreated()
        const receiverId = selectMatrixAuth(receiver.store.getState())?.userId
        expect(receiverId).toBeDefined()
        await sender.store
            .dispatch(
                inviteUserToMatrixRoom({
                    fedimint: sender.bridge.fedimint,
                    roomId,
                    userId: receiverId as string,
                }),
            )
            .unwrap()
        await receiverBuilder.withRoomJoined(roomId)
        renderWithBridge(<ObserveRoom roomId={roomId} />, {
            store: receiver.store,
            fedimint: receiver.bridge.fedimint,
        })

        directory = await mkdtemp(path.join(tmpdir(), 'chat-send-recovery-'))
        const firstName = attachmentType === 'image' ? 'first.png' : 'first.txt'
        const secondName =
            attachmentType === 'image' ? 'second.png' : 'second.txt'
        const firstPath = path.join(directory, firstName)
        const secondPath = path.join(directory, secondName)
        const fileContent =
            attachmentType === 'image'
                ? await readFile(
                      path.join(__dirname, '../../assets/images/fedi-logo.png'),
                  )
                : Buffer.from('test attachment')
        await writeFile(firstPath, fileContent)
        await writeFile(secondPath, fileContent)
        const document = (filePath: string): DocumentPickerResponse => ({
            uri: `file://${filePath}`,
            name: path.basename(filePath),
            type: 'text/plain',
            nativeType: 'text/plain',
            convertibleToMimeTypes: null,
            size: 16,
            isVirtual: false,
            hasRequestedType: true,
            error: null,
        })
        if (attachmentType === 'image') {
            jest.mocked(launchImageLibrary).mockResolvedValueOnce({
                assets: [firstPath, secondPath].map(filePath => ({
                    uri: `file://${filePath}`,
                    fileName: path.basename(filePath),
                    type: 'image/png',
                    width: 1,
                    height: 1,
                    fileSize: fileContent.length,
                })),
            })
        } else {
            jest.mocked(pick).mockResolvedValueOnce([
                document(firstPath),
                document(secondPath),
            ])
        }
        const route = {
            key: 'chat-send-recovery',
            name: 'ChatRoomConversation',
            params: { roomId },
        } as Props['route']
        const navigation = {
            navigate: jest.fn(),
            dispatch: jest.fn(),
            replace: jest.fn(),
        } as unknown as Props['navigation']
        Object.assign(mockRoute, route)
        const view = renderWithBridge(
            <ChatRoomConversation route={route} navigation={navigation} />,
            { store: sender.store, fedimint: sender.bridge.fedimint },
        )
        if (messageType === 'reply') {
            await act(async () => {
                await receiver.store
                    .dispatch(
                        sendMatrixMessage({
                            fedimint: receiver.bridge.fedimint,
                            roomId,
                            body: 'reply target',
                        }),
                    )
                    .unwrap()
            })
            const replyTarget = await waitFor(() => {
                const event = selectMatrixRoomEvents(
                    sender.store.getState(),
                    roomId,
                ).find(
                    candidate =>
                        !candidate.localEcho &&
                        'body' in candidate.content &&
                        candidate.content.body === 'reply target',
                )
                if (!event) throw new Error('Reply target has not synced')
                return event
            })
            await act(async () => {
                sender.store.dispatch(
                    setChatReplyingToMessage({
                        roomId,
                        event: replyTarget,
                    }),
                )
            })
            expect(
                selectReplyingToMessageEventForRoom(
                    sender.store.getState(),
                    roomId,
                )?.id,
            ).toBe(replyTarget.id)
        }
        const addFile = view
            .UNSAFE_getAllByType(SvgImage)
            .find(
                icon =>
                    icon.props.name ===
                    (attachmentType === 'image' ? 'Image' : 'Plus'),
            )
        if (!addFile) throw new Error('Document picker button is missing')
        await act(async () => {
            fireEvent.press(addFile)
        })
        const body = 'body before attachments'
        fireEvent.changeText(view.getByTestId('MessageInput-TextInput'), body)
        await rm(secondPath)
        mockToast.error.mockClear()
        fireEvent.press(view.getByTestId('MessageInput-SendButton'))

        const receivedBodies = () =>
            selectMatrixRoomEvents(receiver.store.getState(), roomId)
                .filter(event => !event.localEcho)
                .flatMap(event =>
                    'body' in event.content ? [event.content.body] : [],
                )
        await waitFor(
            () => {
                expect(mockToast.error).toHaveBeenCalled()
                expect(receivedBodies()).toContain(body)
                expect(receivedBodies()).toContain(firstName)
                expect(receivedBodies()).not.toContain(secondName)
                if (messageType === 'reply') {
                    const reply = selectMatrixRoomEvents(
                        receiver.store.getState(),
                        roomId,
                    ).find(
                        candidate =>
                            !candidate.localEcho &&
                            'body' in candidate.content &&
                            candidate.content.body === body,
                    )
                    expect(reply?.inReply).toBeTruthy()
                }
                expect(
                    selectReplyingToMessageEventForRoom(
                        sender.store.getState(),
                        roomId,
                    ),
                ).toBeNull()
            },
            { timeout: 20000 },
        )

        await writeFile(secondPath, fileContent)
        if (messageType === 'reply') {
            fireEvent.changeText(
                view.getByTestId('MessageInput-TextInput'),
                'next message',
            )
        }
        await act(async () => {
            fireEvent.press(view.getByTestId('MessageInput-SendButton'))
        })
        await waitFor(
            () => {
                expect(receivedBodies()).toContain(secondName)
                expect(
                    view.getByTestId('MessageInput-TextInput').props.value,
                ).toBe('')
                if (messageType === 'reply') {
                    const event = selectMatrixRoomEvents(
                        receiver.store.getState(),
                        roomId,
                    ).find(
                        candidate =>
                            !candidate.localEcho &&
                            'body' in candidate.content &&
                            candidate.content.body === 'next message',
                    )
                    expect(event).toBeDefined()
                    expect(event?.inReply).toBeNull()
                }
            },
            { timeout: 20000 },
        )
        await act(async () => {
            await sender.store
                .dispatch(
                    sendMatrixMessage({
                        fedimint: sender.bridge.fedimint,
                        roomId,
                        body: 'after retry',
                    }),
                )
                .unwrap()
        })
        await waitFor(
            () => {
                expect(receivedBodies()).toContain('after retry')
            },
            { timeout: 20000 },
        )
        const expectedBodies = [
            body,
            firstName,
            secondName,
            ...(messageType === 'reply' ? ['next message'] : []),
        ]
        const delivered = receivedBodies().filter(value =>
            expectedBodies.includes(value as string),
        )
        expect(delivered.sort()).toEqual(expectedBodies.sort())
    })
})
