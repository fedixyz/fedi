import { Text, Theme, useTheme } from '@rneui/themed'
import { TFunction } from 'i18next'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native'

import { selectMatrixRoomPinnedEvents } from '@fedi/common/redux'
import { MatrixEvent } from '@fedi/common/types'
import {
    getEventBodyPreview,
    getEventPreviewTextKey,
} from '@fedi/common/utils/matrix'
import { stripAndDeduplicateWhitespace } from '@fedi/common/utils/strings'

import { useAppSelector } from '../../../state/hooks'
import { Column, Row } from '../../ui/Flex'
import SvgImage from '../../ui/SvgImage'

type Props = {
    roomId: string
    focusedEventId?: string | null
    onPressPinnedMessage?: (eventId: string) => void
}

const MAX_VISIBLE_PROGRESS_SEGMENTS = 3
const PROGRESS_SEGMENT_HEIGHT = 12
const PROGRESS_SEGMENT_GAP = 3
const PROGRESS_SEGMENT_STEP = PROGRESS_SEGMENT_HEIGHT + PROGRESS_SEGMENT_GAP

const getActivePinnedIndex = (
    currentIndex: number | null,
    pinnedCount: number,
) => {
    if (pinnedCount === 0) {
        return -1
    }

    if (currentIndex === null) {
        return pinnedCount - 1
    }

    return ((currentIndex % pinnedCount) + pinnedCount) % pinnedCount
}

const getPinnedPreviewText = ({
    event,
    t,
}: {
    event: MatrixEvent | null
    t: TFunction
}) => {
    if (!event) {
        return t('feature.chat.pinned-message')
    }

    const previewTextKey = getEventPreviewTextKey(event)
    if (previewTextKey) {
        return t(previewTextKey)
    }

    return stripAndDeduplicateWhitespace(getEventBodyPreview(event, 120))
}

const getPinnedRailWindow = (activeIndex: number, pinnedCount: number) => {
    const visibleSegments =
        pinnedCount > 0
            ? Math.min(pinnedCount, MAX_VISIBLE_PROGRESS_SEGMENTS)
            : 0
    const viewportHeight = visibleSegments
        ? visibleSegments * PROGRESS_SEGMENT_HEIGHT +
          (visibleSegments - 1) * PROGRESS_SEGMENT_GAP
        : 0
    const windowStart =
        pinnedCount > 0
            ? Math.max(
                  0,
                  Math.min(
                      activeIndex - (visibleSegments - 1),
                      pinnedCount - visibleSegments,
                  ),
              )
            : 0

    return {
        viewportHeight,
        offset: -windowStart * PROGRESS_SEGMENT_STEP,
        initialOffset:
            pinnedCount > 0
                ? -Math.max(0, pinnedCount - visibleSegments) *
                  PROGRESS_SEGMENT_STEP
                : 0,
    }
}

const PinnedMessageBanner: React.FC<Props> = ({
    roomId,
    focusedEventId = null,
    onPressPinnedMessage,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const pinnedEvents = useAppSelector(s =>
        selectMatrixRoomPinnedEvents(s, roomId),
    )
    const [currentIndex, setCurrentIndex] = useState<number | null>(null)
    const [dismissed, setDismissed] = useState(false)
    const pinnedEventsKey = pinnedEvents.map(event => event.id).join('|')
    const contentProgress = useRef(new Animated.Value(1)).current
    const progressRailTranslateY = useRef(new Animated.Value(0)).current
    const previousEventIdRef = useRef<string | undefined>(undefined)
    const previousRailOffsetRef = useRef<number | null>(null)

    const style = styles(theme)

    const hasPinnedMessages = pinnedEvents.length > 0
    const lastPinnedIndex = hasPinnedMessages ? pinnedEvents.length - 1 : 0
    const activeIndex = getActivePinnedIndex(currentIndex, pinnedEvents.length)
    const currentEvent = activeIndex >= 0 ? pinnedEvents[activeIndex] : null
    const currentEventId = currentEvent?.id as string | undefined
    const previewText = getPinnedPreviewText({ event: currentEvent, t })
    const progressLabel =
        pinnedEvents.length > 1
            ? `${activeIndex + 1}/${pinnedEvents.length}`
            : null
    const progressRailWindow = getPinnedRailWindow(
        activeIndex,
        pinnedEvents.length,
    )
    const progressRailOffset = progressRailWindow.offset
    const initialProgressRailOffset = progressRailWindow.initialOffset

    // When the pinned set changes, we treat it like a fresh banner so new pins
    // show up again even if the user dismissed the old set.
    useEffect(() => {
        setCurrentIndex(null)
        setDismissed(false)
        previousEventIdRef.current = undefined
        previousRailOffsetRef.current = initialProgressRailOffset
        contentProgress.setValue(1)
        progressRailTranslateY.setValue(initialProgressRailOffset)
    }, [
        contentProgress,
        initialProgressRailOffset,
        pinnedEventsKey,
        progressRailTranslateY,
        roomId,
    ])

    // The banner only advances after chat confirms that the current pin really
    // focused, so tapping the banner never races ahead of the scroll result.
    useEffect(() => {
        if (
            !focusedEventId ||
            focusedEventId !== currentEventId ||
            pinnedEvents.length <= 1
        ) {
            return
        }

        setCurrentIndex(prev => {
            const nextIndex = prev === null ? lastPinnedIndex : prev
            return (nextIndex - 1 + pinnedEvents.length) % pinnedEvents.length
        })
    }, [currentEventId, focusedEventId, lastPinnedIndex, pinnedEvents.length])

    useEffect(() => {
        if (!hasPinnedMessages) {
            previousRailOffsetRef.current = null
            progressRailTranslateY.setValue(0)
            return
        }

        if (previousRailOffsetRef.current === null) {
            previousRailOffsetRef.current = progressRailOffset
            progressRailTranslateY.setValue(progressRailOffset)
            return
        }

        if (previousRailOffsetRef.current === progressRailOffset) return

        previousRailOffsetRef.current = progressRailOffset
        Animated.timing(progressRailTranslateY, {
            toValue: progressRailOffset,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start()
    }, [
        hasPinnedMessages,
        progressRailOffset,
        progressRailTranslateY,
        activeIndex,
    ])

    useEffect(() => {
        if (!currentEventId) {
            previousEventIdRef.current = undefined
            contentProgress.setValue(1)
            return
        }

        if (!previousEventIdRef.current) {
            previousEventIdRef.current = currentEventId
            return
        }

        if (previousEventIdRef.current === currentEventId) return

        previousEventIdRef.current = currentEventId
        contentProgress.setValue(0)

        Animated.timing(contentProgress, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start()
    }, [contentProgress, currentEventId])

    if (!hasPinnedMessages || dismissed) return null

    const handlePress = () => {
        if (currentEventId && onPressPinnedMessage) {
            onPressPinnedMessage(currentEventId)
        }
    }

    const progressRailAnimatedStyle = {
        transform: [{ translateY: progressRailTranslateY }],
    }

    const contentAnimatedStyle = {
        opacity: contentProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, 1],
        }),
        transform: [
            {
                translateY: contentProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-10, 0],
                }),
            },
        ],
    }

    return (
        <View style={style.container}>
            <Pressable
                onPress={handlePress}
                style={style.pressable}
                testID="pinned-message-banner">
                <View
                    style={[
                        style.progressRailViewport,
                        { height: progressRailWindow.viewportHeight },
                    ]}
                    testID="pinned-message-progress-viewport">
                    <Animated.View style={progressRailAnimatedStyle}>
                        <Column style={style.progressRailTrack}>
                            {pinnedEvents.map((event, index) => (
                                <View
                                    key={event.id}
                                    style={[
                                        style.progressSegment,
                                        index === activeIndex &&
                                            style.progressSegmentActive,
                                    ]}
                                    testID="pinned-message-progress-indicator"
                                />
                            ))}
                        </Column>
                    </Animated.View>
                </View>
                <Animated.View style={[style.content, contentAnimatedStyle]}>
                    <Column gap="xxs">
                        <Row align="center" justify="between" gap="sm">
                            <Row align="center" gap="xs" shrink>
                                <SvgImage
                                    name="PinFilled"
                                    size={14}
                                    color={theme.colors.primary}
                                />
                                <Text
                                    small
                                    bold
                                    numberOfLines={1}
                                    style={style.label}>
                                    {t('feature.chat.pinned-message')}
                                </Text>
                            </Row>
                            {progressLabel ? (
                                <Text
                                    medium
                                    small
                                    style={style.progressLabel}
                                    testID="pinned-message-count">
                                    {progressLabel}
                                </Text>
                            ) : null}
                        </Row>
                        <Text
                            caption
                            numberOfLines={1}
                            style={style.preview}
                            testID="pinned-message-preview">
                            {previewText}
                        </Text>
                    </Column>
                </Animated.View>
            </Pressable>
            <Pressable
                onPress={() => setDismissed(true)}
                hitSlop={8}
                style={style.dismissButton}
                testID="pinned-message-dismiss">
                <SvgImage name="Close" size={16} color={theme.colors.grey} />
            </Pressable>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.extraLightGrey,
            backgroundColor: theme.colors.white,
        },
        pressable: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
        },
        progressRailViewport: {
            width: 4,
            flexShrink: 0,
            overflow: 'hidden',
        },
        progressRailTrack: {
            gap: PROGRESS_SEGMENT_GAP,
        },
        progressSegment: {
            width: 4,
            height: PROGRESS_SEGMENT_HEIGHT,
            borderRadius: 999,
            backgroundColor: theme.colors.extraLightGrey,
        },
        progressSegmentActive: {
            backgroundColor: theme.colors.primary,
        },
        content: {
            flex: 1,
        },
        label: {
            color: theme.colors.primary,
            flexShrink: 1,
        },
        progressLabel: {
            color: theme.colors.grey,
            flexShrink: 0,
        },
        preview: {
            color: theme.colors.darkGrey,
            lineHeight: 18,
        },
        dismissButton: {
            paddingLeft: theme.spacing.md,
        },
    })

export default PinnedMessageBanner
