import { Theme, useTheme } from '@rneui/themed'
import React from 'react'
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    ViewStyle,
} from 'react-native'
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context'

/*
    UI Component: KeyboardAwareWrapper

    Android keyboard behavior seems to work fine by default but
    iOS keyboards block the UI components instead of pushing them
    up into view

    This component handles this OS-specific inconsistency and also adds
    a full-sized view for dismissing the keyboard by tapping anywhere outside
    the keyboard. The dismiss behavior can also be disabled if needed
*/

type KeyboardAwareWrapperProps = {
    children: React.ReactNode
    dismissableArea?: boolean
    additionalVerticalOffset?: number
    containerStyle?: ViewStyle
    dismissableAreaStyle?: ViewStyle
}

const KeyboardAwareWrapper: React.FC<KeyboardAwareWrapperProps> = ({
    children,
    dismissableArea = true,
    additionalVerticalOffset = 0,
    containerStyle = {},
    dismissableAreaStyle = {},
}: KeyboardAwareWrapperProps) => {
    const insets = useSafeAreaInsets()
    const { theme } = useTheme()

    const mergedContainerStyles = [
        styles(theme, insets).container,
        containerStyle,
    ]
    const mergedDismissableAreaStyles = [
        styles(theme, insets).dismissableArea,
        dismissableAreaStyle,
    ]

    return (
        <KeyboardAvoidingView
            style={mergedContainerStyles}
            enabled={Platform.OS === 'ios'}
            keyboardVerticalOffset={insets.bottom + additionalVerticalOffset}
            behavior={'padding'}>
            <Pressable
                disabled={dismissableArea === false}
                style={mergedDismissableAreaStyles}
                onPress={() => Keyboard.dismiss()}>
                {children}
            </Pressable>
        </KeyboardAvoidingView>
    )
}

const styles = (_theme: Theme, _insets: EdgeInsets) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
        },
        dismissableArea: {
            flex: 1,
            alignItems: 'center',
            width: '100%',
        },
    })

export default KeyboardAwareWrapper
