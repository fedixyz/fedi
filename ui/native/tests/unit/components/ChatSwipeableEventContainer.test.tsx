import { act, cleanup } from '@testing-library/react-native'
import React from 'react'
import { Animated, Text } from 'react-native'

import { selectChatReplyingToMessage } from '@fedi/common/redux'
import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'

import ChatSwipeableEventContainer from '../../../components/feature/chat/ChatSwipeableEventContainer'
import { renderWithProviders } from '../../utils/render'

let mockSwipeableProps: {
    children: React.ReactNode
    onSwipeableOpen?: (direction: 'left' | 'right') => void
    onSwipeableClose?: () => void
}

jest.mock('react-native-gesture-handler', () => {
    const ReactActual = jest.requireActual('react')
    const { ScrollView, View } = jest.requireActual('react-native')

    return {
        ScrollView,
        Swipeable: ReactActual.forwardRef((props: any, ref: any) => {
            ReactActual.useImperativeHandle(ref, () => ({
                close: jest.fn(),
            }))
            mockSwipeableProps = props

            return ReactActual.createElement(
                View,
                { testID: 'mock-swipeable' },
                props.children,
            )
        }),
    }
})

jest.mock('../../../components/ui/SvgImage', () => {
    const { Text: RNText } = jest.requireActual('react-native')

    return {
        __esModule: true,
        default: ({ name }: { name: string }) => <RNText>{name}</RNText>,
        SvgImageSize: {
            md: 'md',
        },
    }
})

describe('ChatSwipeableEventContainer', () => {
    const event = createMockNonPaymentEvent()

    let animationStart: jest.Mock
    let sequenceSpy: jest.SpyInstance

    beforeEach(() => {
        jest.clearAllMocks()
        animationStart = jest.fn()
        sequenceSpy = jest.spyOn(Animated, 'sequence').mockReturnValue({
            start: animationStart,
        } as unknown as Animated.CompositeAnimation)
    })

    afterEach(() => {
        cleanup()
        sequenceSpy.mockRestore()
    })

    it('should not start the action animation on mount', () => {
        renderWithProviders(
            <ChatSwipeableEventContainer roomId={event.roomId} event={event}>
                <Text>message</Text>
            </ChatSwipeableEventContainer>,
        )

        expect(sequenceSpy).not.toHaveBeenCalled()
        expect(animationStart).not.toHaveBeenCalled()
    })

    it('should still start the action animation after swipe state changes', () => {
        renderWithProviders(
            <ChatSwipeableEventContainer roomId={event.roomId} event={event}>
                <Text>message</Text>
            </ChatSwipeableEventContainer>,
        )

        act(() => {
            mockSwipeableProps.onSwipeableClose?.()
        })

        expect(sequenceSpy).toHaveBeenCalledTimes(1)
        expect(animationStart).toHaveBeenCalledTimes(1)
    })

    it('should reply to the message when swipe opens', () => {
        const { store } = renderWithProviders(
            <ChatSwipeableEventContainer roomId={event.roomId} event={event}>
                <Text>message</Text>
            </ChatSwipeableEventContainer>,
        )

        act(() => {
            mockSwipeableProps.onSwipeableOpen?.('right')
        })

        expect(selectChatReplyingToMessage(store.getState())).toEqual({
            roomId: event.roomId,
            event,
        })
    })
})
