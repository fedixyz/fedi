import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { isNightly } from '../../utils/device-info'

const NightlyBuildBanner: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const show = useMemo(() => isNightly(), [])

    if (!show) return null

    const style = styles(theme)

    return (
        <View style={style.container}>
            <Text small style={style.text} adjustsFontSizeToFit>
                {t('feature.developer.nightly')}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            position: 'absolute',
            bottom: 0,
            right: theme.spacing.lg,
            backgroundColor: theme.colors.primary,
            paddingHorizontal: theme.spacing.sm,
            borderTopLeftRadius: 5,
            borderTopRightRadius: 5,
        },
        text: {
            fontSize: 10,
            color: theme.colors.secondary,
        },
    })

export default NightlyBuildBanner
