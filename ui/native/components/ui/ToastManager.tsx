import { Theme, useTheme } from '@rneui/themed'
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
import SvgImage from './SvgImage'

const nightGradient = [...fediTheme.nightHoloAmbientGradient]

export default function ToastManager() {
    const toast = useAppSelector(selectToast)
    const slideAnim = useRef(new Animated.Value(-100)).current
    const dimensions = useWindowDimensions()
    const insets = useSafeAreaInsets()

    const [toastHeight, setToastHeight] = useState(100)
    const [cachedToast, setCachedToast] = useState(toast)
    const [isToastOpen, setIsToastOpen] = useState(!!toast)

    const { close } = useToast()
    const { theme } = useTheme()

    const handleCloseToast = useCallback(
        (open: boolean) => {
            setIsToastOpen(open)
            if (!open) close(toast?.key)
        },
        [toast, close],
    )

    useEffect(() => {
        if (toast) {
            setCachedToast(toast)
            setIsToastOpen(true)
        } else {
            setIsToastOpen(false)
        }
    }, [toast, slideAnim, toastHeight])

    useEffect(() => {
        if (isToastOpen) {
            slideAnim.setValue(-toastHeight)
            Animated.timing(slideAnim, {
                toValue: insets.top,
                duration: 300,
                useNativeDriver: true,
            }).start()
        } else {
            Animated.timing(slideAnim, {
                toValue: -toastHeight,
                duration: 300,
                useNativeDriver: true,
            }).start()
        }
    }, [isToastOpen, insets, slideAnim, toastHeight, toast?.key])

    const handleLayout = useCallback(
        (e: LayoutChangeEvent) => {
            const { height } = e.nativeEvent.layout
            setToastHeight(height)
        },
        [setToastHeight],
    )

    const style = styles(theme)
    const maxMultiplier = 1.4

    return (
        <Animated.View
            onLayout={handleLayout}
            style={[
                style.toastOuter,
                {
                    transform: [
                        {
                            translateY: slideAnim,
                        },
                    ],
                    maxWidth: dimensions.width - 80,
                },
            ]}>
            {/* Please forgive me Oscar 🙏😭. There were five shadows in the figma design I swear */}
            <View style={[style.wrapper, style.toastShadow1]}>
                <View style={[style.wrapper, style.toastShadow2]}>
                    <View style={[style.wrapper, style.toastShadow3]}>
                        <View style={[style.wrapper, style.toastShadow4]}>
                            <View style={[style.wrapper, style.toastShadow5]}>
                                <LinearGradient
                                    style={style.wrapper}
                                    colors={[
                                        'rgba(255, 255, 255, 0.15)',
                                        'rgba(255, 255, 255, 0)',
                                    ]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 0, y: 1 }}>
                                    <LinearGradient
                                        style={[style.wrapper, style.toast]}
                                        colors={nightGradient}
                                        start={{ x: 0, y: 0.75 }}
                                        end={{ x: 1, y: 0.95 }}>
                                        <View>
                                            <Text
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
                                        </View>
                                        <View style={style.toastContent}>
                                            <Text
                                                style={style.toastText}
                                                maxFontSizeMultiplier={
                                                    maxMultiplier
                                                }
                                                adjustsFontSizeToFit>
                                                {cachedToast?.content}
                                            </Text>
                                        </View>
                                        <View>
                                            <Pressable
                                                onPress={() =>
                                                    handleCloseToast(false)
                                                }>
                                                <SvgImage
                                                    name="Close"
                                                    color={theme.colors.grey}
                                                />
                                            </Pressable>
                                        </View>
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
            display: 'flex',
            backgroundColor: theme.colors.black,
            borderRadius: 16,
            elevation: 4,
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
            display: 'flex',
            borderRadius: 16,
        },
        toast: {
            alignItems: 'center',
            padding: 14,
            flexDirection: 'row',
            gap: 12,
        },
        toastIcon: {
            fontSize: 20,
        },
        toastContent: {
            flexGrow: 1,
            flexBasis: 0,
        },
        toastText: {
            color: theme.colors.white,
            fontSize: 14,
            fontFamily: 'AlbertSans-Regular',
        },
    })
