import { Button, Overlay, Text, Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useRef, useState } from 'react'
import {
    Animated,
    Easing,
    Insets,
    LayoutChangeEvent,
    Platform,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
}

const CustomOverlay: React.FC<CustomOverlayProps> = ({
    onBackdropPress,
    show = false,
    contents,
    loading,
}) => {
    const { theme } = useTheme()
    const insets = useSafeAreaInsets()
    const [overlayHeight, setOverlayHeight] = useState(0)
    const animatedOpacity = useRef(new Animated.Value(0)).current
    const animatedTranslateY = useRef(new Animated.Value(0)).current
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

    // Animate overlay in and out
    useEffect(() => {
        if (!overlayHeight) return
        Animated.timing(animatedTranslateY, {
            toValue: show ? 0 : overlayHeight,
            duration: 200,
            delay: show ? 150 : 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
        }).start()
    }, [show, animatedTranslateY, overlayHeight])

    // Set height whenever overlay layout changes.
    const handleOverlayLayout = (event: LayoutChangeEvent) => {
        const { height } = event.nativeEvent.layout
        if (!overlayHeight) {
            // On initial height report, immediately set height without animation,
            // and begin to fade in to avoid visual jump.
            animatedTranslateY.setValue(height)
            Animated.timing(animatedOpacity, {
                toValue: 1,
                duration: 100,
                useNativeDriver: true,
            }).start()
        }
        setOverlayHeight(height)
    }

    const renderButtons = () => {
        return buttons.map((button: CustomOverlayButton, i: number) => {
            return (
                <Button
                    key={i}
                    containerStyle={style.buttonContainer}
                    title={button.text}
                    titleProps={{
                        numberOfLines: 1,
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

    return (
        <Overlay
            isVisible={show}
            onBackdropPress={onBackdropPress}
            overlayStyle={style.overlayContainer}>
            <Animated.View
                onLayout={handleOverlayLayout}
                style={{
                    ...style.overlayContents,
                    opacity: animatedOpacity,
                    transform: [{ translateY: animatedTranslateY }],
                    // Ensure there is double the size of theme.spacing.xl to click on the backdrop to dismiss the overlay
                    maxHeight:
                        viewportHeight -
                        insets.top -
                        insets.bottom -
                        theme.spacing.xl * 2,
                }}>
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
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: theme.spacing.sm,
        },
        buttonContainer: {
            marginHorizontal: theme.spacing.sm,
            flex: 1,
        },
    })

export default CustomOverlay
