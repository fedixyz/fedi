import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ActivityIndicator,
    Animated,
    Easing,
    StyleSheet,
    ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch } from 'react-redux'

import {
    selectIsInternetUnreachable,
    setInternetUnreachableBadgeVisibility,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'

interface Props {
    offset?: number
    noSafeArea?: boolean
    hide?: boolean
}

export const InternetIsUnreachableBadge: React.FC<Props> = ({
    offset = 0,
    noSafeArea,
    hide,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const dispatch = useDispatch()
    const isInternetUnreachable = useAppSelector(selectIsInternetUnreachable)

    const [isDelayedOffline, setIsDelayedOffline] = useState(false)

    useEffect(() => {
        if (isInternetUnreachable) {
            dispatch(setInternetUnreachableBadgeVisibility(true))
            const timer = setTimeout(() => {
                setIsDelayedOffline(true)
            }, 1200)

            return () => clearTimeout(timer)
        } else {
            setIsDelayedOffline(false)
            dispatch(setInternetUnreachableBadgeVisibility(false))
        }
    }, [isInternetUnreachable, dispatch])

    const visibleAnimation = useRef(new Animated.Value(0)).current

    useEffect(() => {
        Animated.timing(visibleAnimation, {
            toValue: isInternetUnreachable && !hide ? 1 : 0,
            duration: 150,
            useNativeDriver: false,
            easing: Easing.ease,
        }).start()
    }, [visibleAnimation, isInternetUnreachable, hide])

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
        backgroundColor: theme.colors.lightGrey,
    }

    const badgeText = isDelayedOffline
        ? t('errors.internet-offline') // Show "Internet is unreachable" after timeout
        : t('errors.internet-connecting') // Show "Connecting..." immediately

    const style = styles(theme)

    return (
        <Animated.View
            style={[
                style.container,
                containerStyle,
                isInternetUnreachable && !hide ? { zIndex: 3 } : { zIndex: -1 },
            ]}>
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
