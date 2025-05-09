import { Text, Theme, useTheme } from '@rneui/themed'
import {
    ActivityIndicator,
    GestureResponderEvent,
    Pressable,
    StyleSheet,
    View,
} from 'react-native'

import * as Svgs from '../../../assets/images/svgs'
import SvgImage from '../../ui/SvgImage'

export type SettingsItemProps = {
    disabled?: boolean
    icon: keyof typeof Svgs
    label: string
    action?: React.ReactNode
    actionIcon?: keyof typeof Svgs
    isLoading?: boolean
    adornment?: React.ReactNode
    onPress: (event: GestureResponderEvent) => void
    color?: string
}

const SettingsItem = ({
    disabled = false,
    icon,
    label,
    action,
    actionIcon = 'ChevronRight',
    isLoading = false,
    onPress,
    adornment = null,
    color,
}: SettingsItemProps) => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <Pressable
            style={({ pressed }) => [
                style.container,
                // dont react to presses if disabled
                disabled
                    ? style.disabled
                    : {
                          backgroundColor: pressed
                              ? theme.colors.primary05
                              : 'transparent',
                      },
            ]}
            onPress={disabled ? undefined : onPress}>
            <>
                <View style={style.content}>
                    <SvgImage
                        color={color || theme.colors.primary}
                        dimensions={{ width: 24, height: 24 }}
                        name={icon}
                        size={theme.sizes.md}
                    />
                    <Text
                        color={color || theme.colors.primary}
                        adjustsFontSizeToFit
                        maxFontSizeMultiplier={1.6}
                        numberOfLines={1}>
                        {label}
                    </Text>
                    {adornment ? <>{adornment}</> : null}
                </View>
                {isLoading ? (
                    <ActivityIndicator size={theme.sizes.sm} />
                ) : (
                    action || (
                        <SvgImage
                            name={actionIcon}
                            color={color || theme.colors.grey}
                        />
                    )
                )}
            </>
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'transparent',
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            borderRadius: theme.borders.settingsRadius,
        },
        content: {
            flexDirection: 'row',
            flex: 1,
            alignItems: 'center',
            gap: theme.spacing.sm,
        },
        disabled: {
            opacity: 0.3,
        },
    })

export default SettingsItem
