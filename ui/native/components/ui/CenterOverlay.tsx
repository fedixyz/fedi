import { Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import {
    StyleProp,
    StyleSheet,
    View,
    ViewStyle,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
    Pressable,
} from 'react-native'
import Modal from 'react-native-modal'

import SvgImage from './SvgImage'

type CenterOverlayProps = {
    onBackdropPress?: () => void
    show?: boolean
    overlayStyle?: StyleProp<ViewStyle>
    children: React.ReactNode
    showCloseButton?: boolean
}

const width = Dimensions.get('window').width

const CenterOverlay: React.FC<CenterOverlayProps> = ({
    onBackdropPress,
    show = false,
    overlayStyle,
    children,
    showCloseButton = false,
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    // Prevent unnecessary updates
    const memoizedChildren = useMemo(() => children, [children])

    // Prevent re-renders
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
            useNativeDriverForBackdrop
            style={style.modalContainer}>
            {/* wraps the modal content for keyboard avoidance - required by react-native-modal */}
            <KeyboardAvoidingView
                behavior={'position'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 30 : -50}>
                <View style={memoizedOverlayStyle}>
                    {memoizedChildren}
                    {showCloseButton && (
                        <Pressable
                            onPress={onBackdropPress}
                            style={style.closeButton}
                            hitSlop={10}>
                            <SvgImage
                                name="Close"
                                size={24}
                                color={theme.colors.primary}
                            />
                        </Pressable>
                    )}
                </View>
            </KeyboardAvoidingView>
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
            maxWidth: width - width * 0.1,
            minWidth: Platform.OS === 'android' ? '79%' : width - width * 0.12,
            padding: theme.spacing.xl,
            borderRadius: theme.borders.defaultRadius,
            alignItems: 'center',
            backgroundColor: theme.colors.background,
            position: 'relative',
        },
        closeButton: {
            position: 'absolute',
            top: theme.spacing.xl,
            right: theme.spacing.xl,
        },
    })

export default CenterOverlay
