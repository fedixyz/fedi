import { cleanup, fireEvent, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Keyboard, Pressable } from 'react-native'

import { selectSelectedChatMessage, setupStore } from '@fedi/common/redux'
import { mockMatrixEventFile } from '@fedi/common/tests/mock-data/matrix-event'

import ChatFileEvent from '../../../../../components/feature/chat/ChatFileEvent'
import { renderWithProviders } from '../../../../utils/render'

jest.mock('../../../../../utils/hooks/media', () => ({
    useDownloadResource: jest.fn(() => ({
        isDownloading: false,
        handleDownload: jest.fn(),
    })),
}))

describe('ChatFileEvent', () => {
    afterEach(() => {
        cleanup()
        jest.clearAllMocks()
    })

    it('should dismiss the keyboard before selecting the file message on long press', async () => {
        const store = setupStore()
        const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss')

        const { UNSAFE_getAllByType } = renderWithProviders(
            <ChatFileEvent event={mockMatrixEventFile} />,
            { store },
        )

        fireEvent(UNSAFE_getAllByType(Pressable)[0], 'onLongPress')

        expect(dismissKeyboard).toHaveBeenCalled()
        await waitFor(() => {
            expect(selectSelectedChatMessage(store.getState())).toEqual(
                mockMatrixEventFile,
            )
        })
    })
})
