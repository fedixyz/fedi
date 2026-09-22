import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import { createMockFedimintBridge } from '@fedi/common/tests/utils/fedimint'

import MessageInput from '../../../../../components/feature/chat/MessageInput'
import { mockToast } from '../../../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../../../utils/render'

const ROOM_ID = '!room:test.server'

function renderInput(onMessageSubmitted: jest.Mock) {
    renderWithProviders(
        <MessageInput
            id={ROOM_ID}
            isPublic={false}
            onMessageSubmitted={onMessageSubmitted}
        />,
        { fedimint: createMockFedimintBridge() },
    )
}

describe('MessageInput', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('keeps the draft and shows an error when the send fails', async () => {
        const onMessageSubmitted = jest
            .fn()
            .mockRejectedValue(new Error('send failed'))
        renderInput(onMessageSubmitted)

        fireEvent.changeText(
            screen.getByTestId('MessageInput-TextInput'),
            'hello',
        )
        fireEvent.press(screen.getByTestId('MessageInput-SendButton'))

        await waitFor(() => {
            expect(onMessageSubmitted).toHaveBeenCalledTimes(1)
        })
        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledTimes(1)
        })
        expect(screen.getByTestId('MessageInput-TextInput').props.value).toBe(
            'hello',
        )
    })

    it('clears the draft when the send succeeds', async () => {
        const onMessageSubmitted = jest.fn().mockResolvedValue(undefined)
        renderInput(onMessageSubmitted)

        fireEvent.changeText(
            screen.getByTestId('MessageInput-TextInput'),
            'hello',
        )
        fireEvent.press(screen.getByTestId('MessageInput-SendButton'))

        await waitFor(() => {
            expect(
                screen.getByTestId('MessageInput-TextInput').props.value,
            ).toBe('')
        })
        expect(mockToast.error).not.toHaveBeenCalled()
    })
})
