import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import {
    selectLatestAwareReleaseTag,
    selectShouldPresentAppUpdate,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import { useUpdateFlagPlatformSensitive } from '../../../utils/hooks/release'
import { openAppStore } from '../../../utils/release'
import SvgImage from '../../ui/SvgImage'

export default function HeaderUpdateBanner() {
    const latestReleaseTag = useAppSelector(selectLatestAwareReleaseTag)
    const shouldPresent = useAppSelector(selectShouldPresentAppUpdate)
    const updateFlagPlatformSensitive = useUpdateFlagPlatformSensitive()

    const { t } = useTranslation()
    const { theme } = useTheme()

    if (!shouldPresent || !updateFlagPlatformSensitive) return null

    const style = styles(theme)

    return (
        <Pressable onPress={openAppStore} style={style.container}>
            <Text caption medium>
                {t('feature.updates.version-available-update-now', {
                    version: latestReleaseTag,
                })}
            </Text>
            <SvgImage name="ArrowRight" size={16} color={theme.colors.orange} />
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            backgroundColor: theme.colors.orange200,
            paddingVertical: theme.spacing.md,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
        },
    })
