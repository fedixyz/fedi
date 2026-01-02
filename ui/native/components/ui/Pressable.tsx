import { Theme, useTheme } from '@rneui/themed'
import {
    Pressable as BasePressable,
    PressableProps as BaseProps,
    StyleProp,
    StyleSheet,
    ViewStyle,
} from 'react-native'

export type PressableProps = {
    loading?: boolean
    disabled?: boolean
    disabledStyle?: StyleProp<ViewStyle>
    children?: React.ReactNode
    containerStyle?: StyleProp<ViewStyle>
} & Omit<BaseProps, 'style'>

export const Pressable: React.FC<PressableProps> = ({
    loading = false,
    disabled = false,
    disabledStyle = { opacity: 0.25 },
    children = <></>,
    containerStyle = {},
    ...props
}) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <BasePressable
            style={({ pressed }) => [
                style.container,
                disabled || loading ? disabledStyle : {},
                !!props.onPress && pressed && !disabled ? style.pressed : {},
                containerStyle,
            ]}
            {...props}>
            {children}
        </BasePressable>
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
        pressed: {
            backgroundColor: theme.colors.primary05,
        },
    })
