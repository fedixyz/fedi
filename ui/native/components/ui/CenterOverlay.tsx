import { Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import Modal from 'react-native-modal'

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
    const style = styles(theme)

    // to prevent unnecessary updates
    const memoizedChildren = useMemo(() => children, [children])

    // to prevent re-renders
    const memoizedOverlayStyle = useMemo(
        () => [style.overlayContainer, overlayStyle],
        [style.overlayContainer, overlayStyle],
    )

    return (
        <Modal
            isVisible={show}
            onBackdropPress={onBackdropPress}
            backdropOpacity={0.5}
            animationIn="fadeIn"
            animationOut="fadeOut"
            useNativeDriver
            style={style.modalContainer}>
            <View style={memoizedOverlayStyle}>{memoizedChildren}</View>
        </Modal>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        modalContainer: {
            justifyContent: 'center',
            alignItems: 'center',
            margin: 0,
        },
        overlayContainer: {
            width: '90%',
            maxWidth: 312,
            padding: theme.spacing.xl,
            borderRadius: theme.borders.defaultRadius,
            alignItems: 'center',
            backgroundColor: theme.colors.background,
        },
    })

export default CenterOverlay
