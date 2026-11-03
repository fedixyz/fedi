import { act, cleanup } from '@testing-library/react-native'
import React from 'react'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'
import { BridgeError } from '@fedi/common/utils/errors'
import {
    configureLogging,
    exportUiLogs,
    resetLogging,
} from '@fedi/common/utils/log'

import ChatUserConversation from '../../../screens/ChatUserConversation'
import { mockNavigation, mockRoute } from '../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../utils/render'

jest.unmock('@fedi/common/utils/log')

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
        resetLogging()
        let savedLogs = ''
        configureLogging({
            saveLogs: async logs => {
                savedLogs += logs
            },
            readLogs: async () => savedLogs,
        })
        const error = new BridgeError({
            error: 'client error (Connect)',
            detail: 'connection refused',
            errorCode: null,
        })
        const fedimint = createMockFedimintBridge()
        ;(fedimint as any).getMatrixClient = () => ({
            fetchMatrixProfile: () => Promise.resolve({ id: USER_ID }),
            sendDirectMessage: () => Promise.reject(error),
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
            ).rejects.toMatchObject({ message: error.message })
        })
        const logs = (await exportUiLogs())
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
        expect(logs).toContainEqual(
            expect.objectContaining({
                level: 'ERROR',
                context: 'ChatUserConversation',
                message: 'error sending direct message',
                extra: [expect.stringContaining('client error (Connect)')],
            }),
        )
        resetLogging()
    })
})
