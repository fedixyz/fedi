import { useTheme } from '@rneui/themed'
import { t } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    Animated,
    LayoutChangeEvent,
    Pressable,
    Text,
    View,
    useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useToast } from '@fedi/common/hooks/toast'
import { selectToast } from '@fedi/common/redux'

import { useToastScope } from '../../state/contexts/ToastScopeContext'
import { useAppSelector } from '../../state/hooks'
import { toastStyles as styles } from '../../styles/toast'
import { useLaunchZendesk } from '../../utils/hooks/support'
import Flex from './Flex'
import SvgImage, { SvgImageSize } from './SvgImage'

type ToastAction = {
    label: string
    onPress: () => void
}

export type ExtendedToast = {
    key: string
    status: 'success' | 'info' | 'error'
    content: string
    action?: ToastAction
}

export default function ToastManager() {
    const { scope } = useToastScope()
    const toast = useAppSelector(state =>
        scope === 'global'
            ? (selectToast(state) as ExtendedToast | null)
            : null,
    )
    const shouldRender = scope === 'global'
    const slideAnim = useRef(new Animated.Value(-100)).current
    const dimensions = useWindowDimensions()
    const insets = useSafeAreaInsets()

    const [toastHeight, setToastHeight] = useState(100)
    const [cachedToast, setCachedToast] = useState<ExtendedToast | null>(toast)
    const [isToastOpen, setIsToastOpen] = useState(!!toast)

    const { launchZendesk } = useLaunchZendesk()

    const { close } = useToast()
    const { theme } = useTheme()

    const handleCloseToast = useCallback(() => {
        setIsToastOpen(false)
        if (toast) close(toast.key)
    }, [toast, close])

    const handleActionPress = useCallback(() => {
        launchZendesk()
        handleCloseToast()
    }, [handleCloseToast, launchZendesk])

    useEffect(() => {
        if (toast) {
            setCachedToast(toast)
            setIsToastOpen(true)
        } else {
            setIsToastOpen(false)
        }
    }, [toast])

    useEffect(() => {
        const toValue = isToastOpen ? insets.top : -toastHeight
        Animated.timing(slideAnim, {
            toValue,
            duration: 300,
            useNativeDriver: true,
        }).start()
    }, [isToastOpen, insets.top, toastHeight, slideAnim])

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
        setToastHeight(e.nativeEvent.layout.height)
    }, [])

    const style = styles(theme)
    const maxMultiplier = 1.4
    const actionLabel = cachedToast?.action?.label ?? t('feature.support.title')

    if (!shouldRender || !cachedToast) return null

    return (
        <Animated.View
            onLayout={handleLayout}
            style={[
                style.toastOuter,
                {
                    transform: [{ translateY: slideAnim }],
                    maxWidth: dimensions.width - 80,
                },
            ]}>
            <View style={[style.wrapper, style.toastShadow1]}>
                <View style={[style.wrapper, style.toastShadow2]}>
                    <View style={[style.wrapper, style.toastShadow3]}>
                        <View style={[style.wrapper, style.toastShadow4]}>
                            <View style={[style.wrapper, style.toastShadow5]}>
                                <View
                                    style={[
                                        style.wrapper,
                                        style.outerGradient,
                                    ]}>
                                    <View
                                        style={[
                                            style.wrapper,
                                            style.toast,
                                            style.innerGradient,
                                        ]}>
                                        <View style={style.contentRow}>
                                            <Text
                                                testID={
                                                    cachedToast?.status ===
                                                    'success'
                                                        ? 'SuccessToast'
                                                        : cachedToast?.status ===
                                                            'info'
                                                          ? 'InfoToast'
                                                          : 'ErrorToast'
                                                }
                                                style={style.toastIcon}
                                                maxFontSizeMultiplier={
                                                    maxMultiplier
                                                }
                                                adjustsFontSizeToFit>
                                                {cachedToast?.status ===
                                                'success'
                                                    ? '👍'
                                                    : cachedToast?.status ===
                                                        'info'
                                                      ? '👀'
                                                      : '⚠️'}
                                            </Text>
                                            <Flex grow basis={false}>
                                                <Text
                                                    style={style.toastText}
                                                    maxFontSizeMultiplier={
                                                        maxMultiplier
                                                    }
                                                    adjustsFontSizeToFit>
                                                    {cachedToast?.content}
                                                </Text>
                                            </Flex>
                                            <Pressable
                                                onPress={handleCloseToast}>
                                                <SvgImage
                                                    name="Close"
                                                    color={theme.colors.grey}
                                                />
                                            </Pressable>
                                        </View>
                                        {cachedToast?.status === 'error' && (
                                            <Pressable
                                                style={style.actionButton}
                                                android_ripple={{
                                                    color:
                                                        theme.colors.white +
                                                        '20',
                                                }}
                                                onPress={handleActionPress}>
                                                <Flex
                                                    row
                                                    align="center"
                                                    justify="center"
                                                    gap="sm">
                                                    <SvgImage
                                                        name="SmileMessage"
                                                        size={SvgImageSize.xs}
                                                        color={
                                                            theme.colors.white
                                                        }
                                                    />
                                                    <Text
                                                        style={
                                                            style.actionButtonText
                                                        }>
                                                        {actionLabel}
                                                    </Text>
                                                </Flex>
                                            </Pressable>
                                        )}
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </Animated.View>
    )
}
