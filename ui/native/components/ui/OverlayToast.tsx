import { useTheme } from '@rneui/themed'
import { t } from 'i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
    Animated,
    Text,
    View,
    Pressable,
    useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useToast } from '@fedi/common/hooks/toast'
import { selectToast } from '@fedi/common/redux'

import { useToastScope } from '../../state/contexts/ToastScopeContext'
import { useAppSelector } from '../../state/hooks'
import { toastStyles as styles } from '../../styles/toast'
import Flex from './Flex'
import SvgImage, { SvgImageSize } from './SvgImage'

export default function OverlayToast() {
    const { scope, setScope } = useToastScope()
    const toast = useAppSelector(state =>
        scope === 'overlay' ? selectToast(state) : null,
    )
    const shouldRender = scope === 'overlay'
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const dims = useWindowDimensions()
    const slide = useRef(new Animated.Value(-100)).current
    const [height, setHeight] = useState(100)
    const [open, setOpen] = useState(!!toast)
    const [cached, setCached] = useState(toast)
    const { close } = useToast()

    useEffect(() => {
        setScope('overlay')
        return () => {
            // ensure redux toast is cleared so ToastManager won't render it later
            close()
            setScope('global')
        }
    }, [setScope, close])

    useEffect(() => {
        if (toast) {
            setCached(toast)
            setOpen(true)
        } else {
            setOpen(false)
        }
    }, [toast])

    useEffect(() => {
        Animated.timing(slide, {
            toValue: open ? insets.top : -height,
            duration: 300,
            useNativeDriver: true,
        }).start()
    }, [open, insets.top, height, slide])

    const style = styles(theme)
    const testID =
        cached?.status === 'success'
            ? 'SuccessToast'
            : cached?.status === 'info'
              ? 'InfoToast'
              : 'ErrorToast'
    const icon =
        cached?.status === 'success'
            ? '👍'
            : cached?.status === 'info'
              ? '👀'
              : '⚠️'
    const actionLabel = useMemo(() => t('feature.support.title'), [])

    if (!shouldRender || !cached) return null

    return (
        <Animated.View
            pointerEvents="box-none"
            onLayout={e => setHeight(e.nativeEvent.layout.height)}
            style={[
                style.toastOuter,
                {
                    transform: [{ translateY: slide }],
                    maxWidth: dims.width - 80,
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
                                                testID={testID}
                                                style={style.toastIcon}>
                                                {icon}
                                            </Text>
                                            <Flex grow basis={false}>
                                                <Text style={style.toastText}>
                                                    {cached.content}
                                                </Text>
                                            </Flex>
                                            <Pressable
                                                onPress={() => {
                                                    setOpen(false)
                                                    // also clear redux state immediately
                                                    close()
                                                }}>
                                                <SvgImage
                                                    name="Close"
                                                    color={theme.colors.grey}
                                                />
                                            </Pressable>
                                        </View>
                                        {cached.status === 'error' && (
                                            <View style={style.actionButton}>
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
                                            </View>
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
