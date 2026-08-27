import { Text, Theme, useTheme } from '@rneui/themed'
import {
    ActivityIndicator,
    GestureResponderEvent,
    Pressable,
    StyleProp,
    StyleSheet,
    TextStyle,
    View,
    ViewStyle,
} from 'react-native'

import { Column, Row } from '../../ui/Flex'
import NotificationDot from '../../ui/NotificationDot'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

export type SettingsItemProps = {
    disabled?: boolean
    icon: SvgImageName
    label: string
    action?: React.ReactNode
    actionIcon?: SvgImageName
    isLoading?: boolean
    adornment?: React.ReactNode
    showNotificationDot?: boolean
    onPress: (event: GestureResponderEvent) => void
    color?: string
    testID?: string
    /** Secondary line under the label. */
    description?: string
    /** Override row padding, e.g. to sit flush inside a bordered card. */
    style?: StyleProp<ViewStyle>
    labelStyle?: StyleProp<TextStyle>
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
    showNotificationDot = false,
    color,
    testID,
    description,
    style: styleOverride,
    labelStyle,
}: SettingsItemProps) => {
    const { theme } = useTheme()
    const style = styles(theme)
    return (
        <Pressable
            testID={testID}
            style={({ pressed }) => [
                style.container,
                styleOverride,
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
                <Row grow align="center" gap="sm" basis={false}>
                    <View>
                        <SvgImage
                            color={color || theme.colors.primary}
                            dimensions={{ width: 24, height: 24 }}
                            name={icon}
                            size={theme.sizes.md}
                        />
                        {showNotificationDot && (
                            <NotificationDot style={style.iconDot} />
                        )}
                    </View>
                    <Column gap="xxs" style={style.text}>
                        <Text
                            color={color || theme.colors.primary}
                            style={labelStyle}
                            numberOfLines={2}
                            ellipsizeMode="tail">
                            {label}
                        </Text>
                        {description ? (
                            <Text small color={theme.colors.darkGrey}>
                                {description}
                            </Text>
                        ) : null}
                    </Column>
                    {adornment ? <>{adornment}</> : null}
                </Row>
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
        disabled: {
            opacity: 0.3,
        },
        text: {
            flex: 1,
            flexWrap: 'wrap',
            flexShrink: 1,
        },
        iconDot: {
            position: 'absolute',
            top: -3,
            right: -3,
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: theme.colors.white,
        },
    })

export default SettingsItem
