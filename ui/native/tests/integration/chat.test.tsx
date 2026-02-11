import { act, fireEvent, waitFor } from '@testing-library/react-native'

import { createMatrixRoom } from '@fedi/common/redux'
import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'

import MessageInput from '../../components/feature/chat/MessageInput'
import { renderWithBridge } from '../utils/render'

describe('chat', () => {
    const builder = createIntegrationTestBuilder(waitFor)
    const context = builder.getContext()

    describe('MessageInput', () => {
        it('prevents duplicate sends from rapid button taps', async () => {
            await builder.withChatReady()
            const {
                bridge: { fedimint },
                store,
            } = context

            const { roomId } = await store
                .dispatch(
                    createMatrixRoom({
                        fedimint,
                        name: 'test-room',
                    }),
                )
                .unwrap()

            const onMessageSubmitted = jest.fn().mockResolvedValue(undefined)

            const { getByTestId } = renderWithBridge(
                <MessageInput
                    onMessageSubmitted={onMessageSubmitted}
                    id={roomId}
                    isPublic={false}
                />,
                { store, fedimint },
            )

            const input = getByTestId('MessageInput-TextInput')
            fireEvent.changeText(input, 'test message')

            const sendButton = getByTestId('MessageInput-SendButton')

            // Simulate 4 rapid button taps in the same React batch
            // The useRef guard should prevent all but the first from executing
            act(() => {
                fireEvent.press(sendButton)
                fireEvent.press(sendButton)
                fireEvent.press(sendButton)
                fireEvent.press(sendButton)
            })

            await waitFor(
                () => {
                    expect(onMessageSubmitted).toHaveBeenCalled()
                },
                { timeout: 5000 },
            )

            // Verify only one message was sent despite 4 rapid taps
            expect(onMessageSubmitted).toHaveBeenCalledTimes(1)
        })
    })
})
