import { cleanup, fireEvent, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Image, Keyboard, Pressable, StyleSheet } from 'react-native'

import { MAX_CHAT_MEDIA_HEIGHT } from '@fedi/common/constants/matrix'
import { selectSelectedChatMessage, setupStore } from '@fedi/common/redux'
import { mockMatrixEventImage } from '@fedi/common/tests/mock-data/matrix-event'
import { MatrixEvent } from '@fedi/common/types'

import ChatImageEvent from '../../../../../components/feature/chat/ChatImageEvent'
import { mockTheme } from '../../../../setup/jest.setup.mocks'
import { renderWithProviders } from '../../../../utils/render'

const mockHandleCopyResource = jest.fn()

jest.mock('../../../../../utils/hooks/media', () => ({
    useDownloadResource: jest.fn(() => ({
        uri: 'file://test-image.png',
        isError: false,
        setIsError: jest.fn(),
        handleCopyResource: mockHandleCopyResource,
    })),
}))

describe('ChatImageEvent', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('renders a fallback square when image dimensions are missing', () => {
        const imageInfo = mockMatrixEventImage.content.info
        if (!imageInfo) throw new Error('mock image event must include info')

        const event: MatrixEvent<'m.image'> = {
            ...mockMatrixEventImage,
            content: {
                ...mockMatrixEventImage.content,
                info: {
                    ...imageInfo,
                    width: null,
                    height: null,
                },
            },
        }

        const { UNSAFE_getByType } = renderWithProviders(
            <ChatImageEvent event={event} />,
        )

        const image = UNSAFE_getByType(Image)
        const imageStyle = StyleSheet.flatten(image.props.style)
        const fallbackSize = Math.min(
            mockTheme.sizes.maxMessageWidth,
            MAX_CHAT_MEDIA_HEIGHT,
        )

        expect(imageStyle.width).toBe(fallbackSize)
        expect(imageStyle.height).toBe(fallbackSize)
        expect(imageStyle.width).toBeGreaterThan(1)
        expect(imageStyle.height).toBeGreaterThan(1)
    })

    it('should dismiss the keyboard before selecting the image message on long press', async () => {
        const store = setupStore()
        const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss')

        const { UNSAFE_getByType } = renderWithProviders(
            <ChatImageEvent event={mockMatrixEventImage} />,
            { store },
        )

        fireEvent(UNSAFE_getByType(Pressable), 'onLongPress')

        expect(dismissKeyboard).toHaveBeenCalled()
        await waitFor(() => {
            expect(selectSelectedChatMessage(store.getState())).toEqual(
                mockMatrixEventImage,
            )
        })
    })
})
