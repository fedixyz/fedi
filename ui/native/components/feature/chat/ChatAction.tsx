import { Text, Theme, useTheme } from '@rneui/themed'
import {
    ActivityIndicator,
    ColorValue,
    GestureResponderEvent,
    StyleProp,
    StyleSheet,
    ViewStyle,
} from 'react-native'

import { Pressable } from '../../ui/Pressable'

type ChatUserActionProps = {
    disabled?: boolean
    leftIcon: React.ReactNode
    label: string
    disabledStyle?: StyleProp<ViewStyle>
    action?: React.ReactNode
    onPress: (event: GestureResponderEvent) => void
    active?: boolean
    rightIcon?: React.ReactNode
    isLoading?: boolean
    labelColor?: ColorValue
}

const ChatAction = ({
    disabled = false,
    active = false,
    disabledStyle,
    leftIcon,
    label,
    labelColor,
    rightIcon,
    isLoading,
    onPress,
}: ChatUserActionProps) => {
    const { theme } = useTheme()
    return (
        <Pressable
            disabled={disabled}
            disabledStyle={disabledStyle}
            onPress={disabled ? undefined : onPress}>
            <>{leftIcon}</>
            <Text
                bold
                style={[
                    styles(theme).label,
                    active ? { color: theme.colors.blue } : {},
                    labelColor ? { color: labelColor } : {},
                ]}>
                {label}
            </Text>
            {isLoading ? <ActivityIndicator size={24} /> : rightIcon}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.sm,
            width: '100%',
            borderRadius: theme.borders.defaultRadius,
        },
        image: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
        },
        label: {
            flexGrow: 1,
            flexShrink: 1,
            color: theme.colors.primary,
            paddingHorizontal: theme.spacing.md,
        },
    })

export default ChatAction
