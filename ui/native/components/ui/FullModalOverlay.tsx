import { Button, Overlay, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
    Animated,
    Easing,
    Insets,
    Keyboard,
    KeyboardEvent,
    Platform,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import SvgImage, { SvgImageName, SvgImageSize } from './SvgImage'

type OverlayButton = {
    text: string
    primary?: boolean
    disabled?: boolean
    onPress: () => void
}

export type OverlayContents = {
    title?: React.ReactNode | string
    icon?: SvgImageName
    headerElement?: React.ReactNode
    url?: string | null
    message?: string | null
    description?: string | null
    body?: React.ReactNode | null
    buttons?: OverlayButton[]
}

type CustomOverlayProps = {
    onBackdropPress?: () => void
    show?: boolean
    contents: OverlayContents
    loading?: boolean
}

const FullModalOverlay: React.FC<CustomOverlayProps> = ({
    onBackdropPress,
    show = false,
    contents,
    loading,
}) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const animatedTranslateY = useRef(new Animated.Value(0)).current
    const { height: viewportHeight } = useWindowDimensions()
    const [keyboardHeight, setKeyboardHeight] = useState<number>(0)
    const [isShowing, setIsShowing] = useState(false)

    const overlayHeight = useMemo(
        () =>
            // Ensure there is double the size of theme.spacing.xl to click on the backdrop to dismiss the overlay
            viewportHeight - insets.top - insets.bottom - theme.spacing.xl * 2,
        [viewportHeight, insets, theme],
    )

    const {
        title,
        icon = null,
        headerElement,
        url = null,
        message = null,
        description = null,
        body = null,
        buttons = [],
    } = contents
    const style = styles(theme, insets)

    useEffect(() => {
        const keyboardShownListener = Keyboard.addListener(
            'keyboardDidShow',
            (e: KeyboardEvent) => {
                setKeyboardHeight(e.endCoordinates.height)
            },
        )
        const keyboardHiddenListener = Keyboard.addListener(
            'keyboardDidHide',
            () => {
                setKeyboardHeight(0)
            },
        )

        return () => {
            keyboardShownListener.remove()
            keyboardHiddenListener.remove()
        }
    }, [])

    useEffect(() => {
        if (show) return setIsShowing(true)
        const timeout = setTimeout(() => setIsShowing(false), 200)
        return () => clearTimeout(timeout)
    }, [show])

    // Animate overlay in and out
    useEffect(() => {
        if (!overlayHeight) return

        Animated.timing(animatedTranslateY, {
            toValue: show ? 0 : overlayHeight,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
        }).start()
    }, [show, animatedTranslateY, overlayHeight])

    const renderButtons = () => {
        return buttons.map((button: OverlayButton, i: number) => {
            return (
                <Button
                    key={i}
                    containerStyle={style.buttonContainer}
                    title={button.text}
                    titleStyle={{
                        color: button.primary
                            ? theme.colors.secondary
                            : theme.colors.primary,
                    }}
                    buttonStyle={{
                        borderWidth: 1,
                        borderRadius: 60,
                    }}
                    loadingProps={{
                        color: button.primary
                            ? theme.colors.secondary
                            : theme.colors.primary,
                    }}
                    loading={loading ? button.primary : false}
                    disabled={loading ? true : button.disabled}
                    onPress={button.onPress}
                />
            )
        })
    }

    return (
        <Overlay
            isVisible={isShowing}
            onBackdropPress={onBackdropPress}
            overlayStyle={style.overlayContainer}>
            <Animated.View
                style={{
                    ...style.overlayContents,
                    transform: [{ translateY: animatedTranslateY }],
                    height:
                        // keyboard awareness is disabled on android so we only want to subtract the keyboard height on android
                        // since iOS handles the keyboard differently
                        // TODO: consolidate keyboard awareness logic across platforms to reduce workarounds like this
                        Platform.OS === 'android'
                            ? overlayHeight - keyboardHeight
                            : overlayHeight,
                }}>
                {icon && (
                    <SvgImage
                        size={SvgImageSize.md}
                        name={icon}
                        containerStyle={style.overlayIcon}
                    />
                )}
                {headerElement}
                {url && (
                    <Text style={style.overlayUrl} numberOfLines={5}>
                        {url}
                    </Text>
                )}
                {title && typeof title === 'string' ? (
                    <Text medium style={style.overlayTitle}>
                        {title}
                    </Text>
                ) : (
                    <>{title}</>
                )}
                {message && (
                    <Text h1 h1Style={style.overlayText}>
                        {message}
                    </Text>
                )}
                {description && (
                    <Text style={style.overlayDescription}>{description}</Text>
                )}
                <ScrollView style={style.bodyContainer}>{body}</ScrollView>
                {buttons?.length > 0 && (
                    <View style={style.overlayButtonView}>
                        {renderButtons()}
                    </View>
                )}
            </Animated.View>
        </Overlay>
    )
}

const styles = (theme: Theme, insets: Insets) =>
    StyleSheet.create({
        overlayContainer: {
            // Undo all overlay styling, overlayContents will handle styling
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 0,
            backgroundColor: 'transparent',
            shadowColor: 'transparent',
        },
        overlayContents: {
            position: 'relative', // Rollback to relative positioning for Appium testing
            bottom: 0,
            left: 0,
            width: '100%',
            alignItems: 'center',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.md,
            paddingBottom: Math.max(theme.spacing.xl, insets.bottom || 0),
            backgroundColor: theme.colors.white,
            ...Platform.select({
                android: {
                    elevation: 2,
                },
                default: {
                    shadowColor: 'rgba(0, 0, 0, .3)',
                    shadowOffset: { width: 0, height: 1 },
                    shadowRadius: 4,
                },
            }),
        },
        bodyContainer: {
            width: '100%',
        },
        overlayTitle: {
            textAlign: 'center',
        },
        overlayIcon: {
            marginBottom: theme.spacing.md,
        },
        overlayUrl: {
            textDecorationLine: 'underline',
            marginBottom: theme.spacing.md,
            textAlign: 'center',
        },
        overlayText: {
            marginTop: theme.spacing.lg,
            textAlign: 'center',
        },
        overlayDescription: {
            color: theme.colors.lightGrey,
            textAlign: 'center',
        },
        overlayButtonView: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: theme.spacing.xl,
        },
        buttonContainer: {
            marginHorizontal: theme.spacing.sm,
            flex: 1,
        },
    })

export default FullModalOverlay
