import { cleanup, fireEvent, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Keyboard, Pressable } from 'react-native'

import { selectSelectedChatMessage, setupStore } from '@fedi/common/redux'
import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'

import ChatTextEvent from '../../../../../components/feature/chat/ChatTextEvent'
import { renderWithProviders } from '../../../../utils/render'

describe('ChatTextEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should dismiss the keyboard before selecting the text message on long press', async () => {
        const store = setupStore()
        const event = createMockNonPaymentEvent()
        const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss')

        const { UNSAFE_getByType } = renderWithProviders(
            <ChatTextEvent event={event} />,
            { store },
        )

        fireEvent(UNSAFE_getByType(Pressable), 'onLongPress')

        expect(dismissKeyboard).toHaveBeenCalled()
        await waitFor(() => {
            expect(selectSelectedChatMessage(store.getState())).toEqual(event)
        })
    })
})
