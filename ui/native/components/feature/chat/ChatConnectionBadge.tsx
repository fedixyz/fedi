import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Animated,
    ActivityIndicator,
    StyleSheet,
    Easing,
    ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { selectIsMatrixReady } from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'

interface Props {
    offset?: number
    noSafeArea?: boolean
    hide?: boolean
}

export const ChatConnectionBadge: React.FC<Props> = ({
    offset = 0,
    noSafeArea,
    hide,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const isReady = useAppSelector(s => selectIsMatrixReady(s))
    const [isStillLoading, setIsStillLoading] = useState(false)

    let isVisible = !isReady
    if (hide) {
        isVisible = false
    }
    // Set isStillLoading to true after 30 seconds to change
    // from 'Loading...' to 'Waiting for network...'
    // reset the loading state if needed
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(() => {
                setIsStillLoading(true)
            }, 30000)

            // Cleanup the timer when the effect is cleaned up
            return () => clearTimeout(timer)
        } else {
            setIsStillLoading(false)
        }
    }, [isVisible])

    const visibleAnimation = useRef(
        new Animated.Value(isVisible ? 1 : 0),
    ).current

    // Animate container in and out when visible
    useEffect(() => {
        Animated.timing(visibleAnimation, {
            toValue: isVisible ? 1 : 0,
            duration: 150,
            useNativeDriver: false,
            easing: Easing.ease,
        }).start()
    }, [visibleAnimation, isVisible])

    const containerStyle: ViewStyle = {
        display: 'flex',
        top: offset + (noSafeArea ? 0 : insets.top),
    }

    const badgeStyle: ViewStyle = {
        opacity: visibleAnimation,
        transform: [
            {
                translateY: visibleAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                }),
            },
            {
                scale: visibleAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                }),
            },
        ],
        backgroundColor: isStillLoading
            ? '#FCDDEC' // TODO: Replace with fuschia from theme when new colors are added
            : theme.colors.lightGrey,
    }
    const badgeText = isStillLoading
        ? t('feature.chat.waiting-for-network')
        : t('words.loading')
    const style = styles(theme)

    return (
        <Animated.View style={[style.container, containerStyle]}>
            <Animated.View style={[style.badge, badgeStyle]}>
                <ActivityIndicator size={16} color={theme.colors.primary} />
                <Text caption medium>
                    {`${badgeText}...`}
                </Text>
            </Animated.View>
        </Animated.View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'absolute',
            left: 0,
            right: 0,
            width: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            pointerEvents: 'box-none',
            zIndex: 3,
            elevation: 3,
        },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            borderRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            shadowRadius: 24,
            shadowColor: theme.colors.night,
            shadowOpacity: 0.1,
        },
    })
