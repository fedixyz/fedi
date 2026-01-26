import React from 'react'
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    View,
    ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useImeFooterLift } from '../../utils/hooks/keyboard'
import { isAndroidAPI35Plus } from '../../utils/layout'

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
    behavior?: 'height' | 'position' | 'padding' | undefined
}

const KeyboardAwareWrapper: React.FC<KeyboardAwareWrapperProps> = ({
    children,
    dismissableArea = true,
    additionalVerticalOffset = 0,
    containerStyle = {},
    dismissableAreaStyle = {},
    behavior = 'padding',
}: KeyboardAwareWrapperProps) => {
    const insets = useSafeAreaInsets()

    const mergedContainerStyles = [style.container, containerStyle]
    const mergedDismissableAreaStyles = [
        style.dismissableArea,
        dismissableAreaStyle,
    ]

    const android35Space = useImeFooterLift()

    if (
        Platform.OS === 'android' &&
        isAndroidAPI35Plus() &&
        behavior === 'padding'
    ) {
        return (
            <View
                style={[
                    mergedContainerStyles,
                    { paddingBottom: android35Space },
                ]}>
                <Pressable
                    accessible={false}
                    disabled={dismissableArea === false}
                    style={mergedDismissableAreaStyles}
                    onPress={() => Keyboard.dismiss()}>
                    {children}
                </Pressable>
            </View>
        )
    }

    return (
        <KeyboardAvoidingView
            style={mergedContainerStyles}
            keyboardVerticalOffset={insets.bottom + additionalVerticalOffset}
            enabled={Platform.OS === 'ios'}
            behavior={behavior}>
            <Pressable
                accessible={false}
                disabled={dismissableArea === false}
                style={mergedDismissableAreaStyles}
                onPress={() => Keyboard.dismiss()}>
                {children}
            </Pressable>
        </KeyboardAvoidingView>
    )
}

const style = StyleSheet.create({
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
