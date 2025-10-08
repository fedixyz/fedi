import React, { memo, useRef, useState, useEffect, useCallback } from 'react'

import ArrowCornerUpLeftIcon from '@fedi/common/assets/svgs/corner-up-left-double.svg'
import ArrowCornerUpRightIcon from '@fedi/common/assets/svgs/corner-up-right-double.svg'
import { setChatReplyingToMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch } from '../../hooks'
import { styled, theme } from '../../styles'
import { Icon } from '../Icon'

const log = makeLog('ChatSwipeableEventContainer')

export interface ChatSwipeableEventContainerProps {
    event: MatrixEvent
    children: React.ReactNode
    dragThreshold?: number
    iconName?: string
    isMe?: boolean
}

export const ChatSwipeableEventContainer: React.FC<ChatSwipeableEventContainerProps> =
    memo(({ event, children, dragThreshold = 60, isMe }) => {
        const dispatch = useAppDispatch()
        const containerRef = useRef<HTMLDivElement>(null)
        const [isDragging, setIsDragging] = useState(false)
        const [swipeDistance, setSwipeDistance] = useState(0)
        const [swipeDirection, setSwipeDirection] = useState<
            'left' | 'right' | null
        >(null)
        const [currentSwipeDirection, setCurrentSwipeDirection] = useState<
            'left' | 'right' | null
        >(null)
        const [renderKey, setRenderKey] = useState(0)
        const [isAnimating, setIsAnimating] = useState(false)

        const startX = useRef(0)
        const currentX = useRef(0)
        const animationId = useRef<number | null>(null)

        const { roomId } = event

        const handleReply = useCallback(() => {
            log.info('Reply activated', {
                roomId,
                eventId: event.id,
                eventContent: event.content,
            })

            dispatch(setChatReplyingToMessage({ roomId, event }))

            setSwipeDistance(0)
            setSwipeDirection(null)
            setCurrentSwipeDirection(null)
            setIsDragging(false)
            setRenderKey(prev => prev + 1)
        }, [dispatch, roomId, event])

        const handleTouchStart = useCallback((e: TouchEvent) => {
            startX.current = e.touches[0].clientX
            currentX.current = e.touches[0].clientX
            setIsDragging(true)
        }, [])

        const handleTouchMove = useCallback(
            (e: TouchEvent) => {
                if (!isDragging) return

                currentX.current = e.touches[0].clientX
                const distance = currentX.current - startX.current
                const absDistance = Math.abs(distance)

                if (absDistance > 10) {
                    e.preventDefault()
                    setSwipeDistance(Math.min(absDistance, 100))
                    setSwipeDirection(distance > 0 ? 'right' : 'left')
                }
            },
            [isDragging],
        )

        const handleTouchEnd = useCallback(() => {
            const distance = Math.abs(currentX.current - startX.current)

            if (distance > dragThreshold) {
                setCurrentSwipeDirection(swipeDirection)
                setRenderKey(prev => prev + 1)
                handleReply()
            } else {
                setCurrentSwipeDirection(null)
                setRenderKey(prev => prev + 1)

                if (animationId.current) {
                    cancelAnimationFrame(animationId.current)
                }

                const animate = () => {
                    setSwipeDistance(prev => {
                        const newDistance = prev * 0.8
                        if (newDistance < 1) {
                            setSwipeDirection(null)
                            setIsDragging(false)
                            return 0
                        }
                        animationId.current = requestAnimationFrame(animate)
                        return newDistance
                    })
                }

                animate()
            }
        }, [dragThreshold, handleReply, swipeDirection])

        const handleMouseDown = useCallback((e: MouseEvent) => {
            if (e.button !== 0) return
            startX.current = e.clientX
            currentX.current = e.clientX
            setIsDragging(true)
        }, [])

        const handleMouseMove = useCallback(
            (e: MouseEvent) => {
                if (!isDragging) return

                currentX.current = e.clientX
                const distance = currentX.current - startX.current
                const absDistance = Math.abs(distance)

                if (absDistance > 10) {
                    e.preventDefault()
                    setSwipeDistance(Math.min(absDistance, 100))
                    setSwipeDirection(distance > 0 ? 'right' : 'left')
                }
            },
            [isDragging],
        )

        const handleMouseUp = useCallback(() => {
            if (!isDragging) return
            handleTouchEnd()
        }, [isDragging, handleTouchEnd])

        useEffect(() => {
            const container = containerRef.current
            if (!container) return

            container.addEventListener('touchstart', handleTouchStart, {
                passive: false,
            })
            container.addEventListener('touchmove', handleTouchMove, {
                passive: false,
            })
            container.addEventListener('touchend', handleTouchEnd)

            container.addEventListener('mousedown', handleMouseDown)
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)

            return () => {
                container.removeEventListener('touchstart', handleTouchStart)
                container.removeEventListener('touchmove', handleTouchMove)
                container.removeEventListener('touchend', handleTouchEnd)

                container.removeEventListener('mousedown', handleMouseDown)
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)

                if (animationId.current !== null) {
                    cancelAnimationFrame(animationId.current)
                    animationId.current = null
                }
            }
        }, [
            handleTouchStart,
            handleTouchMove,
            handleTouchEnd,
            handleMouseDown,
            handleMouseMove,
            handleMouseUp,
        ])

        useEffect(() => {
            if (swipeDistance > 20 && !isAnimating) {
                setIsAnimating(true)
            } else if (swipeDistance <= 20 && isAnimating) {
                setIsAnimating(false)
            }
        }, [swipeDistance, isAnimating])

        const renderAction = (actionSide: 'left' | 'right') => {
            const isLeftSide = actionSide === 'left'

            let iconComponent: typeof ArrowCornerUpLeftIcon
            if (currentSwipeDirection) {
                iconComponent =
                    currentSwipeDirection === 'left'
                        ? ArrowCornerUpLeftIcon
                        : ArrowCornerUpRightIcon
            } else {
                iconComponent = isLeftSide
                    ? ArrowCornerUpRightIcon
                    : ArrowCornerUpLeftIcon
            }

            return (
                <ActionContainer
                    key={`${actionSide}-${renderKey}-${currentSwipeDirection || 'fallback'}`}
                    side={actionSide}>
                    <ActionButton
                        isActive={swipeDistance > dragThreshold}
                        isAnimating={isAnimating}>
                        <Icon
                            key={`icon-${renderKey}-${currentSwipeDirection || 'fallback'}`}
                            icon={iconComponent}
                        />
                    </ActionButton>
                </ActionContainer>
            )
        }

        return (
            <Container ref={containerRef}>
                <SwipeableContent
                    swipeDirection={swipeDirection || 'null'}
                    isDragging={isDragging}
                    isMe={isMe}
                    style={{
                        transform:
                            swipeDirection === 'right'
                                ? `translateX(${swipeDistance}px)`
                                : swipeDirection === 'left'
                                  ? `translateX(-${swipeDistance}px)`
                                  : 'translateX(0px)',
                    }}>
                    {children}
                </SwipeableContent>

                {swipeDirection === 'right' &&
                    swipeDistance > 20 &&
                    renderAction('left')}
                {swipeDirection === 'left' &&
                    swipeDistance > 20 &&
                    renderAction('right')}
            </Container>
        )
    })

const Container = styled('div', {
    position: 'relative',
    backgroundColor: 'transparent',
    touchAction: 'pan-y',
    userSelect: 'none',
    width: '100%',
})

const SwipeableContent = styled('div', {
    transition: 'transform 0.1s ease-out',
    willChange: 'transform',
    width: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    variants: {
        swipeDirection: {
            left: {},
            right: {},
            null: {},
        },
        isDragging: {
            true: {
                transition: 'none',
            },
            false: {},
        },
        isMe: {
            true: { justifyContent: 'flex-end' },
            false: { justifyContent: 'flex-start' },
        },
    },
})
const ActionContainer = styled('div', {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',

    variants: {
        side: {
            left: {
                left: 0,
                paddingRight: theme.spacing.md,
            },
            right: {
                right: 0,
                paddingLeft: theme.spacing.md,
            },
        },
    },
})

const ActionButton = styled('div', {
    width: 34,
    height: 34,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    boxShadow: `0 2px 4px ${theme.colors.black}66`,
    border: `1px solid ${theme.colors.white}33`,
    transform: 'scale(0.5)',
    opacity: 0.2,
    transition: 'all 0.4s ease-out',
    color: theme.colors.white,

    variants: {
        isActive: {
            true: {
                transform: 'scale(1.1)',
                opacity: 1,
            },
            false: {},
        },
        isAnimating: {
            true: {
                transform: 'scale(1)',
                opacity: 1,
            },
            false: {},
        },
    },
})

ChatSwipeableEventContainer.displayName = 'ChatSwipeableEventContainer'
