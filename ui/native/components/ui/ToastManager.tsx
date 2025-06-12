import { Theme, useTheme } from '@rneui/themed'
import { t } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
    Animated,
    LayoutChangeEvent,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native'
import LinearGradient from 'react-native-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useToast } from '@fedi/common/hooks/toast'
import { selectToast } from '@fedi/common/redux'

import { useAppSelector } from '../../state/hooks'
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

const nightGradient = [...fediTheme.nightHoloAmbientGradient]

export default function ToastManager() {
    const toast = useAppSelector(selectToast) as ExtendedToast | null
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
                                <LinearGradient
                                    style={style.wrapper}
                                    colors={[
                                        'rgba(255,255,255,0.15)',
                                        'rgba(255,255,255,0)',
                                    ]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}>
                                    <LinearGradient
                                        style={[style.wrapper, style.toast]}
                                        colors={nightGradient}
                                        start={{ x: 0, y: 0.75 }}
                                        end={{ x: 1, y: 0.95 }}>
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
                                    </LinearGradient>
                                </LinearGradient>
                            </View>
                        </View>
                    </View>
                </View>
            </View>
        </Animated.View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        toastOuter: {
            position: 'absolute',
            top: 0,
            left: 40,
            width: '100%',
            backgroundColor: theme.colors.black,
            borderRadius: 16,
            elevation: 10,
            zIndex: 10,
        },
        toastShadow1: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            backgroundColor: theme.colors.black,
        },
        toastShadow2: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 7 },
            shadowOpacity: 0.13,
            shadowRadius: 7,
            backgroundColor: theme.colors.black,
        },
        toastShadow3: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
            backgroundColor: theme.colors.black,
        },
        toastShadow4: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 29 },
            shadowOpacity: 0.02,
            shadowRadius: 12,
            backgroundColor: theme.colors.black,
        },
        toastShadow5: {
            shadowColor: theme.colors.black,
            shadowOffset: { width: 0, height: 46 },
            shadowOpacity: 0,
            shadowRadius: 13,
            backgroundColor: theme.colors.black,
        },
        wrapper: {
            flexGrow: 1,
            borderRadius: 16,
        },
        toast: {
            padding: 14,
            gap: 12,
        },
        contentRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        toastIcon: {
            fontSize: 20,
        },
        toastText: {
            color: theme.colors.white,
            fontSize: 14,
            fontFamily: 'AlbertSans-Regular',
        },
        actionButton: {
            width: '100%',
            paddingHorizontal: 16,
            paddingVertical: 6,
            borderRadius: 12,
            backgroundColor: theme.colors.darkGrey,
        },
        actionButtonText: {
            color: theme.colors.white,
            fontSize: 13,
            fontWeight: '500',
            fontFamily: 'AlbertSans-Medium',
            textAlign: 'center',
        },
    })
