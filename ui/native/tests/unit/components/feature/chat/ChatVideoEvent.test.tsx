import { cleanup, fireEvent, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Keyboard, TouchableOpacity } from 'react-native'

import { selectSelectedChatMessage, setupStore } from '@fedi/common/redux'
import { mockMatrixEventVideo } from '@fedi/common/tests/mock-data/matrix-event'

import ChatVideoEvent from '../../../../../components/feature/chat/ChatVideoEvent'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('../../../../../utils/hooks/media', () => ({
    useDownloadResource: jest.fn(() => ({
        uri: 'file://test-video.mp4',
        isError: false,
        setIsError: jest.fn(),
        handleCopyResource: jest.fn(),
    })),
}))

jest.mock('react-native-video', () => {
    const { View } = jest.requireActual('react-native')
    return {
        __esModule: true,
        default: View,
    }
})

describe('ChatVideoEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should dismiss the keyboard before selecting the video message on long press', async () => {
        const store = setupStore()
        const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss')

        const { UNSAFE_getByType } = renderWithProviders(
            <ChatVideoEvent event={mockMatrixEventVideo} />,
            { store },
        )

        fireEvent(UNSAFE_getByType(TouchableOpacity), 'onLongPress')

        expect(dismissKeyboard).toHaveBeenCalled()
        await waitFor(() => {
            expect(selectSelectedChatMessage(store.getState())).toEqual(
                mockMatrixEventVideo,
            )
        })
    })
})
