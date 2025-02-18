import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { FederationStatus } from '@fedi/common/types'

import SvgImage from '../../ui/SvgImage'
import { ConnectionIcon } from './ConnectionIcon'

type Props = {
    status: FederationStatus
    size?: 'small' | 'large'
    hideArrow?: boolean
}

export const ConnectionTag = ({
    status,
    size = 'small',
    hideArrow = false,
}: Props) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const localeStatus = t(
        // Avoid using template strings in the t() function to prevent unused i18n keys from being stripped out
        status === 'unstable'
            ? 'words.unstable'
            : status === 'online'
              ? 'words.online'
              : 'words.offline',
    )
    const style = styles(theme)
    const iconSize = size === 'small' ? 12 : 16
    return (
        <View
            style={[
                style.container,
                size === 'small' ? style.smallContainer : style.largeContainer,
            ]}>
            <ConnectionIcon size={iconSize} status={status} />
            <Text
                medium
                small={size === 'small'}
                caption={size === 'large'}
                numberOfLines={1}
                adjustsFontSizeToFit
                maxFontSizeMultiplier={1.4}
                style={size === 'small' ? style.smallText : style.largeText}>
                {localeStatus}
            </Text>
            {!hideArrow && <SvgImage size={12} name={'ChevronRight'} />}
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            borderRadius: 10,
            flexDirection: 'row',
            backgroundColor: theme.colors.white,
            justifyContent: 'center',
            alignItems: 'center',
        },
        smallContainer: {
            paddingHorizontal: theme.spacing.xs,
            gap: theme.spacing.xs,
        },
        largeContainer: {
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            gap: theme.spacing.sm,
        },
        smallText: {
            lineHeight: 15,
        },
        largeText: {
            lineHeight: 18,
        },
    })
