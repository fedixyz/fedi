import { Text, Theme, useTheme } from '@rneui/themed'
import {
    ActivityIndicator,
    GestureResponderEvent,
    StyleSheet,
    View,
} from 'react-native'

import * as Svgs from '../../../assets/images/svgs'
import { Pressable } from '../../ui/Pressable'
import SvgImage from '../../ui/SvgImage'

type SettingsItemProps = {
    disabled?: boolean
    image: React.ReactNode
    label: string
    action?: React.ReactNode
    actionIcon?: keyof typeof Svgs
    isLoading?: boolean
    adornment?: React.ReactNode
    onPress: (event: GestureResponderEvent) => void
}

const SettingsItem = ({
    disabled = false,
    image,
    label,
    action,
    actionIcon = 'ChevronRight',
    isLoading = false,
    onPress,
    adornment = null,
}: SettingsItemProps) => {
    const { theme } = useTheme()
    return (
        <Pressable
            containerStyle={[
                styles(theme).container,
                disabled ? { opacity: 0.25 } : {},
            ]}
            onPress={disabled ? undefined : onPress}>
            {image}
            <View style={styles(theme).content}>
                <Text
                    style={styles(theme).label}
                    adjustsFontSizeToFit
                    numberOfLines={1}>
                    {label}
                </Text>
                {adornment}
            </View>
            {isLoading ? (
                <ActivityIndicator size={theme.sizes.sm} />
            ) : (
                action || (
                    <SvgImage
                        name={actionIcon}
                        color={theme.colors.primaryLight}
                    />
                )
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: theme.spacing.md,
            width: '100%',
        },
        image: {
            height: theme.sizes.sm,
            width: theme.sizes.sm,
        },
        label: {
            color: theme.colors.primary,
            paddingHorizontal: theme.spacing.md,
        },
        content: {
            flexDirection: 'row',
            flex: 1,
            alignItems: 'center',
        },
    })

export default SettingsItem
