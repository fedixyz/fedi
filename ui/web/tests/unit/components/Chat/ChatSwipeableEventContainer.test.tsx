import '@testing-library/jest-dom'
import { render, act } from '@testing-library/react'

import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'

import { ChatSwipeableEventContainer } from '../../../../src/components/Chat/ChatSwipeableEventContainer'

const mockDispatch = jest.fn().mockReturnValue(undefined)
jest.mock('../../../../src/hooks', () => ({
    useAppDispatch: () => mockDispatch,
    useAppSelector: jest.fn().mockReturnValue(undefined),
}))

const mockEvent = createMockNonPaymentEvent({
    content: {
        body: 'Test message',
    },
})

function createTouchEvent(
    type: string,
    clientX: number,
    clientY: number,
): TouchEvent {
    const touch = {
        clientX,
        clientY,
        identifier: 0,
        target: document.body,
        screenX: clientX,
        screenY: clientY,
        pageX: clientX,
        pageY: clientY,
        radiusX: 0,
        radiusY: 0,
        rotationAngle: 0,
        force: 1,
    }

    const touchEvent = new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [touch as Touch],
    })

    return touchEvent
}

async function simulateTouchGesture(
    element: HTMLElement,
    {
        startX,
        startY,
        endX,
        endY,
        steps = 5,
    }: {
        startX: number
        startY: number
        endX: number
        endY: number
        steps?: number
    },
): Promise<{ preventDefaultCalled: boolean }> {
    let preventDefaultCalled = false

    await act(async () => {
        element.dispatchEvent(createTouchEvent('touchstart', startX, startY))
    })

    for (let i = 1; i <= steps; i++) {
        const ratio = i / steps
        const currentX = startX + (endX - startX) * ratio
        const currentY = startY + (endY - startY) * ratio

        await act(async () => {
            const moveEvent = createTouchEvent('touchmove', currentX, currentY)
            const origPD = moveEvent.preventDefault
            Object.defineProperty(moveEvent, 'preventDefault', {
                value: () => {
                    preventDefaultCalled = true
                    origPD.call(moveEvent)
                },
                writable: true,
            })
            element.dispatchEvent(moveEvent)
        })
    }

    await act(async () => {
        element.dispatchEvent(createTouchEvent('touchend', 0, 0))
    })

    return { preventDefaultCalled }
}

describe('ChatSwipeableEventContainer', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
            cb(0)
            return 0
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should render children', () => {
        const { getByText } = render(
            <ChatSwipeableEventContainer event={mockEvent}>
                <span>Test child</span>
            </ChatSwipeableEventContainer>,
        )

        expect(getByText('Test child')).toBeInTheDocument()
    })

    it('should trigger reply on a clear horizontal swipe', async () => {
        const { container } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await simulateTouchGesture(swipeContainer, {
            startX: 200,
            startY: 300,
            endX: 280,
            endY: 300,
            steps: 5,
        })

        expect(mockDispatch).toHaveBeenCalled()
    })

    it('should NOT trigger reply during vertical scroll with slight horizontal drift', async () => {
        const { container } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await simulateTouchGesture(swipeContainer, {
            startX: 200,
            startY: 300,
            endX: 265,
            endY: 400,
            steps: 8,
        })

        expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('should NOT call preventDefault during vertical scroll with minor horizontal drift', async () => {
        const { container } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        const { preventDefaultCalled } = await simulateTouchGesture(
            swipeContainer,
            {
                startX: 200,
                startY: 300,
                endX: 215,
                endY: 340,
                steps: 5,
            },
        )

        expect(preventDefaultCalled).toBe(false)
    })
})
