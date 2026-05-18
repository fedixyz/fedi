import '@testing-library/jest-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatType, MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import { ChatConversation } from '../../../../src/components/Chat/ChatConversation'
import { renderWithProviders } from '../../../utils/render'

jest.mock('../../../../src/hooks/dom')
jest.mock('../../../../src/hooks/store')

const onSendMessageSpy = jest.fn()

const userChatProps = {
    type: ChatType.direct,
    id: '1',
    name: 'name',
    events: [],
    onSendMessage: onSendMessageSpy,
    onWalletClick: () => null,
    onPaginate: () => Promise.resolve(),
}
const groupChatProps = {
    type: ChatType.group,
    id: '2',
    name: 'name',
    events: [],
    onSendMessage: onSendMessageSpy,
    onWalletClick: () => null,
    onPaginate: () => Promise.resolve(),
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
        content: {
            msgtype: 'm.room.member',
            userId: '@alice:example.com',
            userDisplayName: 'Alice',
            change: 'joined',
        },
    }
}

describe('/components/Chat/ChatConversation', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('direct chats', () => {
        describe('when the component is rendered', () => {
            it('should show the textbox, both icons and send button', async () => {
                renderWithProviders(<ChatConversation {...userChatProps} />)

                await waitFor(() => {
                    expect(screen.getByRole('textbox')).toBeInTheDocument()
                    expect(
                        screen.getByLabelText('wallet-icon'),
                    ).toBeInTheDocument()
                    expect(
                        screen.getByLabelText('plus-icon'),
                    ).toBeInTheDocument()
                    expect(
                        screen.getByLabelText('send-button'),
                    ).toBeInTheDocument()
                })
            })
        })
    })

    /* public group chats do not allow attachment uploads */
    describe('public group chats', () => {
        describe('when the component is rendered', () => {
            it('should show the textbox and send button only', async () => {
                renderWithProviders(
                    <ChatConversation {...groupChatProps} isPublic />,
                )

                await waitFor(() => {
                    expect(screen.getByRole('textbox')).toBeInTheDocument()
                    expect(
                        screen.queryByLabelText('wallet-icon'),
                    ).not.toBeInTheDocument()
                    expect(
                        screen.queryByLabelText('plus-icon'),
                    ).not.toBeInTheDocument()
                    expect(
                        screen.getByLabelText('send-button'),
                    ).toBeInTheDocument()
                })
            })
        })
    })

    /* non public group chats allow attachment uploads */
    describe('private group chats', () => {
        describe('when the component is rendered', () => {
            it('should show the textbox, plus icon and send button', async () => {
                renderWithProviders(<ChatConversation {...groupChatProps} />)

                await waitFor(() => {
                    expect(screen.getByRole('textbox')).toBeInTheDocument()
                    expect(
                        screen.queryByLabelText('wallet-icon'),
                    ).not.toBeInTheDocument()
                    expect(
                        screen.queryByLabelText('plus-icon'),
                    ).toBeInTheDocument()
                    expect(
                        screen.getByLabelText('send-button'),
                    ).toBeInTheDocument()
                })
            })
        })
    })

    describe('membership events', () => {
        it('should not render room member events on web', async () => {
            const { container } = renderWithProviders(
                <ChatConversation
                    {...groupChatProps}
                    events={[
                        makeTextEvent('$message', 'visible message', 2),
                        makeRoomMemberEvent('$room-member', 1),
                    ]}
                />,
            )

            await waitFor(() => {
                expect(screen.getByText('visible message')).toBeInTheDocument()
            })
            expect(
                container.querySelector('[data-event-id="$room-member"]'),
            ).not.toBeInTheDocument()
        })
    })

    describe('when the send button is clicked without typing into the input', () => {
        it('should not call the onSendMessage function', async () => {
            renderWithProviders(<ChatConversation {...userChatProps} />)

            const button = screen.getByLabelText('send-button')
            userEvent.click(button)

            await waitFor(() => {
                expect(onSendMessageSpy).not.toHaveBeenCalled()
            })
        })
    })

    describe('when a message is typed into the input and the send button is clicked', () => {
        it('should call the onSendMessage function', async () => {
            renderWithProviders(<ChatConversation {...userChatProps} />)

            const input = screen.getByRole('textbox')
            await userEvent.type(input, 'test')

            const button = screen.getByLabelText('send-button')
            await userEvent.click(button)

            await waitFor(() => expect(onSendMessageSpy).toHaveBeenCalled())
            expect(onSendMessageSpy).toHaveBeenCalledWith('test', [], null)
        })
    })

    describe('when an image is uploaded and the send button is clicked', () => {
        it('should call the onSendMessage function', async () => {
            renderWithProviders(<ChatConversation {...userChatProps} />)

            const fileUpload = screen.getByTestId(
                'file-upload',
            ) as HTMLInputElement
            const file = new File(['test'], 'test.png', { type: 'image/png' })

            await userEvent.upload(fileUpload, file)

            expect(fileUpload.files?.length).toBe(1)

            const button = screen.getByLabelText('send-button')
            userEvent.click(button)

            await waitFor(() => {
                expect(onSendMessageSpy).toHaveBeenCalledWith('', [file], null)
            })
        })
    })
})
