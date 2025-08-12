import { useTheme, Theme } from '@rneui/themed'
import React, { memo, useRef, useState, useEffect } from 'react'
import { StyleSheet, View, Animated } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'

import { setChatReplyingToMessage } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch } from '../../../state/hooks'
import SvgImage, { SvgImageSize, SvgImageName } from '../../ui/SvgImage'

const log = makeLog('ChatSwipeableEventContainer')

export interface SwipeableEventContainerProps {
    roomId: string
    event: MatrixEvent
    children: React.ReactNode
    dragThreshold?: number
    iconName?: SvgImageName
}

const ChatSwipeableEventContainer: React.FC<SwipeableEventContainerProps> =
    memo(({ roomId, event, children, dragThreshold = 60 }) => {
        const { theme } = useTheme()
        const dispatch = useAppDispatch()
        const swipeRef = useRef<Swipeable | null>(null)
        const [currentSwipeDirection, setCurrentSwipeDirection] = useState<
            'left' | 'right' | null
        >(null)
        const [renderKey, setRenderKey] = useState(0)

        const scaleAnim = useRef(new Animated.Value(1)).current
        const opacityAnim = useRef(new Animated.Value(1)).current

        useEffect(() => {
            // Start with a nice entrance animation when the action becomes visible
            Animated.sequence([
                Animated.parallel([
                    Animated.spring(scaleAnim, {
                        toValue: 0.5,
                        useNativeDriver: true,
                        tension: 200,
                        friction: 12,
                    }),
                    Animated.timing(opacityAnim, {
                        toValue: 0.2,
                        duration: 150,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.parallel([
                    Animated.spring(scaleAnim, {
                        toValue: 1.1,
                        useNativeDriver: true,
                        tension: 80,
                        friction: 8,
                    }),
                    Animated.timing(opacityAnim, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 100,
                    friction: 10,
                }),
            ]).start()
        }, [renderKey, scaleAnim, opacityAnim])

        // Called when swipe passes the threshold on either side
        const handleReply = () => {
            log.info('Reply activated', {
                roomId,
                eventId: event.eventId || event.id,
                eventContent: event.content,
            })

            dispatch(setChatReplyingToMessage({ roomId, event }))
            swipeRef.current?.close()

            // Reset progress and direction
            setCurrentSwipeDirection(null)
            setRenderKey(prev => prev + 1)
        }

        const renderAction = (actionSide: 'left' | 'right') => {
            const isLeftSide = actionSide === 'left'

            // Fallback: If currentSwipeDirection is null, use the actionSide to determine icon
            let iconToUse: SvgImageName
            if (currentSwipeDirection) {
                // Use the detected swipe direction
                iconToUse =
                    currentSwipeDirection === 'left'
                        ? 'ArrowCornerUpLeftDouble'
                        : 'ArrowCornerUpRightDouble'
            } else {
                // Fallback: left action shows when swiping right, right action shows when swiping left
                iconToUse = isLeftSide
                    ? 'ArrowCornerUpRightDouble'
                    : 'ArrowCornerUpLeftDouble'
            }

            return (
                <View
                    key={`${actionSide}-${renderKey}-${currentSwipeDirection || 'fallback'}`}
                    style={[
                        styles(theme).actionContainer,
                        isLeftSide
                            ? styles(theme).leftAction
                            : styles(theme).rightAction,
                    ]}>
                    <Animated.View
                        style={[
                            styles(theme).action,
                            {
                                transform: [{ scale: scaleAnim }],
                                opacity: opacityAnim,
                            },
                        ]}>
                        <SvgImage
                            key={`icon-${renderKey}-${currentSwipeDirection || 'fallback'}-${iconToUse}`}
                            name={iconToUse}
                            size={SvgImageSize.md}
                            color={theme.colors.white}
                        />
                    </Animated.View>
                </View>
            )
        }

        return (
            <View style={styles(theme).container}>
                <Swipeable
                    ref={swipeRef}
                    renderLeftActions={() => {
                        return renderAction('left')
                    }}
                    renderRightActions={() => {
                        return renderAction('right')
                    }}
                    overshootLeft={false}
                    overshootRight={false}
                    leftThreshold={dragThreshold}
                    rightThreshold={dragThreshold}
                    onSwipeableOpen={direction => {
                        // Set the direction when swipe opens
                        setCurrentSwipeDirection(direction)
                        setRenderKey(prev => prev + 1)
                        handleReply()
                    }}
                    friction={1.5}
                    // Reset animations when swipe closes
                    onSwipeableClose={() => {
                        setCurrentSwipeDirection(null)
                        setRenderKey(prev => prev + 1)
                    }}>
                    {children}
                </Swipeable>
            </View>
        )
    })

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: 'transparent',
        },
        actionContainer: {
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            width: 80,
            position: 'relative',
        },
        leftAction: {
            paddingRight: 20,
        },
        rightAction: {
            paddingLeft: 20,
        },
        action: {
            width: 44,
            height: 44,
            borderRadius: 22,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.black,
            shadowOffset: {
                width: 0,
                height: 2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
            borderWidth: 1,
            borderColor: `${theme.colors.white}33`,
        },
    })

export default ChatSwipeableEventContainer
