import { Overlay, Theme, useTheme } from '@rneui/themed'
import React, { useRef } from 'react'
import {
    Animated,
    LayoutChangeEvent,
    StyleProp,
    StyleSheet,
    ViewStyle,
} from 'react-native'

type CenterOverlayProps = {
    onBackdropPress?: () => void
    show?: boolean
    overlayStyle?: StyleProp<ViewStyle>
    children: React.ReactNode
}

const CenterOverlay: React.FC<CenterOverlayProps> = ({
    onBackdropPress,
    show = false,
    overlayStyle,
    children,
}) => {
    const { theme } = useTheme()
    const animatedOpacity = useRef(new Animated.Value(0)).current
    const animatedTranslateY = useRef(new Animated.Value(0)).current

    const style = styles(theme)

    const handleOverlayLayout = (_: LayoutChangeEvent) => {
        // On initial height report, begin to fade in
        Animated.timing(animatedOpacity, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
        }).start()
    }

    return (
        <Overlay
            isVisible={show}
            onBackdropPress={onBackdropPress}
            overlayStyle={[style.overlayContainer, overlayStyle]}
            animationType="fade">
            <Animated.View
                onLayout={handleOverlayLayout}
                style={{
                    opacity: animatedOpacity,
                    transform: [{ translateY: animatedTranslateY }],
                }}>
                {children}
            </Animated.View>
        </Overlay>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        overlayContainer: {
            width: '90%',
            maxWidth: 312,
            padding: theme.spacing.xl,
            borderRadius: theme.borders.defaultRadius,
            alignItems: 'center',
        },
    })

export default CenterOverlay
