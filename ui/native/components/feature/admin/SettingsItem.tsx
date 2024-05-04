import { Text, Theme, useTheme } from '@rneui/themed'
import { GestureResponderEvent, Pressable, StyleSheet } from 'react-native'

import * as Svgs from '../../../assets/images/svgs'
import SvgImage from '../../ui/SvgImage'

type SettingsItemProps = {
    disabled?: boolean
    image: React.ReactNode
    label: string
    action?: React.ReactNode
    actionIcon?: keyof typeof Svgs
    onPress: (event: GestureResponderEvent) => void
}

const SettingsItem = ({
    disabled = false,
    image,
    label,
    action,
    actionIcon = 'ChevronRight',
    onPress,
}: SettingsItemProps) => {
    const { theme } = useTheme()
    return (
        <Pressable
            style={[styles(theme).container, disabled ? { opacity: 0.25 } : {}]}
            onPress={disabled ? undefined : onPress}>
            {image}
            <Text style={styles(theme).label}>{label}</Text>
            {action || (
                <SvgImage name={actionIcon} color={theme.colors.primaryLight} />
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
            flexGrow: 1,
            flexShrink: 1,
            color: theme.colors.primary,
            paddingHorizontal: theme.spacing.md,
        },
    })

export default SettingsItem
