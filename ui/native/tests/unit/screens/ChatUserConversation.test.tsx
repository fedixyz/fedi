import { act, cleanup } from '@testing-library/react-native'
import React from 'react'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import ChatUserConversation from '../../../screens/ChatUserConversation'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

let latestMessageInputProps: {
    onMessageSubmitted: (body: string) => Promise<void>
} | null = null

jest.mock('../../../components/feature/chat/MessageInput', () => ({
    __esModule: true,
    default: (props: {
        onMessageSubmitted: (body: string) => Promise<void>
    }) => {
        latestMessageInputProps = props
        return null
    },
}))
jest.mock(
    '../../../components/feature/chat/SelectedMessageOverlay',
    () => () => null,
)

const USER_ID = '@bob:test.server'

const chatUserRoute = {
    ...mockRoute,
    key: 'ChatUserConversation',
    name: 'ChatUserConversation',
    params: { userId: USER_ID },
} as any

describe('ChatUserConversation - sending', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        latestMessageInputProps = null
    })

    afterEach(() => {
        cleanup()
    })

    it('propagates a failed send so the composer keeps the draft', async () => {
        const fedimint = createMockFedimintBridge()
        ;(fedimint as any).getMatrixClient = () => ({
            sendDirectMessage: () => Promise.reject(new Error('send failed')),
        })

        renderWithProviders(
            <ChatUserConversation
                navigation={mockNavigation as any}
                route={chatUserRoute}
            />,
            { fedimint },
        )

        const props = latestMessageInputProps
        if (!props) throw new Error('MessageInput was not rendered')

        await act(async () => {
            await expect(
                props.onMessageSubmitted('hello'),
            ).rejects.toMatchObject({ message: 'send failed' })
        })
    })
})
