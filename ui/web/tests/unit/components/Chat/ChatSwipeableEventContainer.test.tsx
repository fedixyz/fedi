import '@testing-library/jest-dom'
import { render, act } from '@testing-library/react'

import { createMockNonPaymentEvent } from '@fedi/common/tests/mock-data/matrix-event'
import { MatrixEvent } from '@fedi/common/types'
import { RpcTimelineEventItemId } from '@fedi/common/types/bindings'

import { ChatSwipeableEventContainer } from '../../../../src/components/Chat/ChatSwipeableEventContainer'

const mockDispatch = jest.fn().mockReturnValue(undefined)
const mockUseAppSelector = jest.fn().mockReturnValue(undefined)
jest.mock('../../../../src/hooks', () => ({
    ...jest.requireActual('../../../../src/hooks'),
    useAppDispatch: () => mockDispatch,
    useAppSelector: (selector: (state: unknown) => unknown) =>
        mockUseAppSelector(selector),
}))
jest.mock('../../../../src/components/Chat/ChatMessageActionsDrawer', () => ({
    ChatMessageActionsDrawer: ({ open }: { open: boolean }) =>
        open ? <div>message actions drawer</div> : null,
}))

const mockEvent = createMockNonPaymentEvent({
    content: {
        body: 'Test message',
    },
})
const mockPollEvent: MatrixEvent<'m.poll'> = {
    id: '$poll-event' as RpcTimelineEventItemId,
    roomId: '!poll-room:example.com',
    timestamp: Date.now(),
    localEcho: false,
    sender: '@other:example.com',
    sendState: null,
    inReply: null,
    mentions: null,
    canReact: false,
    reactions: [],
    content: {
        msgtype: 'm.poll',
        body: 'Where should we meet?',
        kind: 'disclosed',
        maxSelections: 1,
        answers: [
            { id: 'answer-1', text: 'Lobby' },
            { id: 'answer-2', text: 'Courtyard' },
        ],
        votes: {},
        endTime: null,
        hasBeenEdited: false,
    },
}
const mockReactablePollEvent: MatrixEvent<'m.poll'> = {
    ...mockPollEvent,
    canReact: true,
}

const stateWithMessageReactions = {
    environment: {
        featureFlags: {
            message_reactions: {},
        },
    },
}

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

function createPointerEvent(
    type: string,
    {
        clientX,
        clientY,
        pointerType = 'mouse',
        button = 0,
    }: {
        clientX: number
        clientY: number
        pointerType?: string
        button?: number
    },
): MouseEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button,
        clientX,
        clientY,
    })

    Object.defineProperty(event, 'isPrimary', {
        value: true,
    })
    Object.defineProperty(event, 'pointerType', {
        value: pointerType,
    })

    return event
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
        mockUseAppSelector.mockImplementation(selector =>
            selector({ environment: { featureFlags: undefined } }),
        )
        jest.useFakeTimers()
        jest.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
            cb(0)
            return 0
        })
    })

    afterEach(() => {
        jest.useRealTimers()
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

    it('should open message actions after a long press with a touch pointer', async () => {
        const { container, getByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await act(async () => {
            swipeContainer.dispatchEvent(
                createPointerEvent('pointerdown', {
                    clientX: 200,
                    clientY: 300,
                    pointerType: 'touch',
                }),
            )
            jest.advanceTimersByTime(500)
        })

        expect(getByText('message actions drawer')).toBeInTheDocument()
        expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('should not open message actions after a long press with a mouse pointer', async () => {
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await act(async () => {
            swipeContainer.dispatchEvent(
                createPointerEvent('pointerdown', {
                    clientX: 200,
                    clientY: 300,
                    pointerType: 'mouse',
                }),
            )
            jest.advanceTimersByTime(500)
        })

        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should cancel touch long press when the pointer moves', async () => {
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await act(async () => {
            swipeContainer.dispatchEvent(
                createPointerEvent('pointerdown', {
                    clientX: 200,
                    clientY: 300,
                    pointerType: 'touch',
                }),
            )
            swipeContainer.dispatchEvent(
                createPointerEvent('pointermove', {
                    clientX: 200,
                    clientY: 237,
                    pointerType: 'touch',
                }),
            )
            jest.advanceTimersByTime(500)
        })

        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should cancel touch long press when movement commits to swipe before tolerance', async () => {
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await act(async () => {
            swipeContainer.dispatchEvent(
                createPointerEvent('pointerdown', {
                    clientX: 200,
                    clientY: 300,
                    pointerType: 'touch',
                }),
            )
            swipeContainer.dispatchEvent(
                createTouchEvent('touchstart', 200, 300),
            )
        })

        await act(async () => {
            swipeContainer.dispatchEvent(
                createTouchEvent('touchmove', 225, 300),
            )
            jest.advanceTimersByTime(500)
        })

        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should open message actions on right click', async () => {
        const { container, getByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement
        const contextMenuEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })

        await act(async () => {
            swipeContainer.dispatchEvent(contextMenuEvent)
        })

        expect(contextMenuEvent.defaultPrevented).toBe(true)
        expect(getByText('message actions drawer')).toBeInTheDocument()
    })

    it('should preserve the native context menu on media elements', async () => {
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <img alt="Test attachment" src="/attachment.png" />
            </ChatSwipeableEventContainer>,
        )

        const media = container.querySelector('img') as HTMLImageElement
        const contextMenuEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })

        await act(async () => {
            media.dispatchEvent(contextMenuEvent)
        })

        expect(contextMenuEvent.defaultPrevented).toBe(false)
        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should not open message actions after a touch long press on media elements', async () => {
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <img alt="Test attachment" src="/attachment.png" />
            </ChatSwipeableEventContainer>,
        )

        const media = container.querySelector('img') as HTMLImageElement

        await act(async () => {
            media.dispatchEvent(
                createPointerEvent('pointerdown', {
                    clientX: 200,
                    clientY: 300,
                    pointerType: 'touch',
                }),
            )
            jest.advanceTimersByTime(500)
        })

        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should open message actions after a mouse long press on media elements', async () => {
        const { container, getByText } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <img alt="Test attachment" src="/attachment.png" />
            </ChatSwipeableEventContainer>,
        )

        const media = container.querySelector('img') as HTMLImageElement

        await act(async () => {
            media.dispatchEvent(
                createPointerEvent('pointerdown', {
                    clientX: 200,
                    clientY: 300,
                    pointerType: 'mouse',
                }),
            )
            jest.advanceTimersByTime(500)
        })

        expect(getByText('message actions drawer')).toBeInTheDocument()
    })

    it('should not open message actions or suppress context menu when no actions are available', async () => {
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer
                event={mockPollEvent}
                dragThreshold={60}>
                <span>Poll message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement
        const contextMenuEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })

        await act(async () => {
            swipeContainer.dispatchEvent(contextMenuEvent)
        })

        expect(contextMenuEvent.defaultPrevented).toBe(false)
        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should not open message actions after a long press when no actions are available', async () => {
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer
                event={mockPollEvent}
                dragThreshold={60}>
                <span>Poll message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await act(async () => {
            swipeContainer.dispatchEvent(
                createPointerEvent('pointerdown', {
                    clientX: 200,
                    clientY: 300,
                    pointerType: 'touch',
                }),
            )
            jest.advanceTimersByTime(500)
        })

        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should not open reaction actions for polls even when reactions are enabled', async () => {
        mockUseAppSelector.mockImplementation(selector =>
            selector(stateWithMessageReactions),
        )
        const { container, queryByText } = render(
            <ChatSwipeableEventContainer
                event={mockReactablePollEvent}
                dragThreshold={60}>
                <span>Poll message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement
        const contextMenuEvent = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })

        await act(async () => {
            swipeContainer.dispatchEvent(contextMenuEvent)
        })

        expect(contextMenuEvent.defaultPrevented).toBe(false)
        expect(queryByText('message actions drawer')).not.toBeInTheDocument()
    })

    it('should still trigger reply on the next mouse swipe after right click', async () => {
        const { container } = render(
            <ChatSwipeableEventContainer event={mockEvent} dragThreshold={60}>
                <span>Test message</span>
            </ChatSwipeableEventContainer>,
        )

        const swipeContainer = container.firstElementChild as HTMLElement

        await act(async () => {
            swipeContainer.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                }),
            )
        })

        await act(async () => {
            swipeContainer.dispatchEvent(
                new MouseEvent('mousedown', {
                    bubbles: true,
                    button: 0,
                    clientX: 200,
                    clientY: 300,
                }),
            )
        })

        await act(async () => {
            document.dispatchEvent(
                new MouseEvent('mousemove', {
                    bubbles: true,
                    clientX: 280,
                    clientY: 300,
                }),
            )
        })

        await act(async () => {
            document.dispatchEvent(
                new MouseEvent('mouseup', {
                    bubbles: true,
                    button: 0,
                }),
            )
        })

        expect(mockDispatch).toHaveBeenCalled()
    })
})
