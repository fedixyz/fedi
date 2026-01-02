import { useIsFocused } from '@react-navigation/native'
import { Button, Overlay, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import {
    Insets,
    LayoutChangeEvent,
    Platform,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
} from 'react-native'
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    runOnJS,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { getOverlayBottomPadding } from '../../utils/layout'
import Flex from './Flex'
import SvgImage, { SvgImageName, SvgImageSize } from './SvgImage'

type CustomOverlayButton = {
    text: string
    primary?: boolean
    warning?: boolean
    disabled?: boolean
    onPress: () => void
}

export type CustomOverlayContents = {
    title?: React.ReactNode | string
    icon?: SvgImageName
    iconColor?: string
    headerElement?: React.ReactNode
    url?: string | null
    message?: string | null
    description?: string | null
    body?: React.ReactNode | null
    buttons?: CustomOverlayButton[]
}

type CustomOverlayProps = {
    onBackdropPress?: () => void
    show?: boolean
    contents: CustomOverlayContents
    loading?: boolean
    noHeaderPadding?: boolean
}

const CustomOverlay: React.FC<CustomOverlayProps> = ({
    onBackdropPress,
    show = false,
    contents,
    loading,
    noHeaderPadding = false,
}) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const [waitingForExitAnimation, setWaitingForExitAnimation] =
        useState(false)
    const [overlayHeight, setOverlayHeight] = useState(0)
    const animatedOpacity = useSharedValue<number>(0)
    const animatedTranslateY = useSharedValue<number>(0)
    const { height: viewportHeight } = useWindowDimensions()

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
        // wait for first render since we need the height to inform the translateY value for animation
        if (!overlayHeight) return

        if (show) {
            // fade in and slide up
            animatedOpacity.value = withTiming(1, {
                duration: 150,
                easing: Easing.out(Easing.quad),
            })
            animatedTranslateY.value = withTiming(0, {
                duration: 300,
                easing: Easing.out(Easing.quad),
            })
        } else {
            // fade out and slide down
            animatedOpacity.value = withTiming(0, {
                duration: 150,
                easing: Easing.in(Easing.quad),
            })
            animatedTranslateY.value = withTiming(
                overlayHeight,
                {
                    duration: 150,
                    easing: Easing.in(Easing.quad),
                },
                // completion callback:
                () => {
                    // we must update state on the JS thread since animations happen on UI thread
                    runOnJS(setWaitingForExitAnimation)(false)
                },
            )
        }
        // no need to include sharedValues as dependencies
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, overlayHeight])

    // Set height whenever overlay layout changes.
    const handleOverlayLayout = (event: LayoutChangeEvent) => {
        const { height } = event.nativeEvent.layout
        if (!overlayHeight) {
            // On initial height report, immediately set height without animation
            // to prevent a visual jump glitch the 1st time the overlay is shown
            animatedTranslateY.value = height
        }
        setOverlayHeight(height)
    }

    const animatedContentStyle = useAnimatedStyle(() => ({
        opacity: animatedOpacity.value,
        transform: [{ translateY: animatedTranslateY.value }],
    }))

    const renderButtons = () => {
        return buttons.map((button: CustomOverlayButton, i: number) => {
            return (
                <Button
                    key={i}
                    containerStyle={style.buttonContainer}
                    title={button.text}
                    titleProps={{
                        adjustsFontSizeToFit: true,
                        maxFontSizeMultiplier: 1.4,
                    }}
                    titleStyle={{
                        color:
                            button.primary || button.warning
                                ? theme.colors.secondary
                                : theme.colors.primary,
                    }}
                    buttonStyle={{
                        backgroundColor: button.primary
                            ? theme.colors.primary
                            : button.warning
                              ? theme.colors.red
                              : theme.colors.secondary,
                        borderWidth: 1,
                        borderRadius: 60,
                        borderColor: button.warning
                            ? theme.colors.red
                            : theme.colors.primary,
                        height: 60,
                    }}
                    loadingProps={{
                        color:
                            button.primary || button.warning
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

    // this makes sure we keep showing the overlay until exit animation is complete
    const handleBackdropPress = () => {
        setWaitingForExitAnimation(true)
        onBackdropPress?.()
    }
    // we must make sure the screen the overlay is rendering on has focus before
    // showing the overlay otherwise the user will get stuck on an undismissable overlay
    const isFocused = useIsFocused()
    const shouldShowOverlay = isFocused && (show || waitingForExitAnimation)

    return (
        <Overlay
            isVisible={shouldShowOverlay}
            onBackdropPress={handleBackdropPress}
            overlayStyle={style.overlayContainer}>
            <Animated.View
                onLayout={handleOverlayLayout}
                style={[
                    style.overlayContents,
                    animatedContentStyle,
                    {
                        // Ensure there is double the size of theme.spacing.xl to click on the backdrop to dismiss the overlay
                        maxHeight:
                            viewportHeight -
                            insets.top -
                            insets.bottom -
                            theme.spacing.xl * 2,
                    },
                    noHeaderPadding && {
                        paddingTop: 0,
                        paddingHorizontal: 0,
                    },
                ]}>
                {icon && <SvgImage size={SvgImageSize.md} name={icon} />}
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
                {body && (
                    <ScrollView
                        alwaysBounceVertical={false}
                        style={style.bodyContainer}>
                        {body}
                    </ScrollView>
                )}
                {buttons?.length > 0 && (
                    <Flex row justify="between" style={style.overlayButtonView}>
                        {renderButtons()}
                    </Flex>
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
            paddingBottom: getOverlayBottomPadding(
                theme.spacing.xl,
                insets.bottom || 0,
            ),
            backgroundColor: theme.colors.white,
            gap: theme.spacing.xl,
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
        overlayUrl: {
            textDecorationLine: 'underline',
            textAlign: 'center',
        },
        overlayText: {
            textAlign: 'center',
        },
        overlayDescription: {
            textAlign: 'center',
        },
        overlayButtonView: {
            marginTop: theme.spacing.sm,
        },
        buttonContainer: {
            marginHorizontal: theme.spacing.sm,
            flex: 1,
        },
    })

export default CustomOverlay
