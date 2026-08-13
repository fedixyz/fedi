import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { isEdge, isExperimental, isNova } from '../../utils/device-info'

const NightlyBuildBanner: React.FC = () => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const show = useMemo(() => isExperimental() || isEdge(), [])
    const isNovaFlavor = useMemo(() => isNova(), [])
    const isEdgeFlavor = useMemo(() => isEdge(), [])

    if (!show) return null

    const style = styles(theme)

    return (
        <View
            style={[
                style.container,
                isNovaFlavor && style.nova,
                isEdgeFlavor && style.edge,
            ]}>
            <Text small style={style.text} adjustsFontSizeToFit>
                {isEdgeFlavor
                    ? t('feature.developer.edge')
                    : isNovaFlavor
                      ? t('feature.developer.nova')
                      : t('feature.developer.nightly')}
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
        nova: {
            backgroundColor: '#B91735',
        },
        edge: {
            backgroundColor: '#B8860B',
        },
        text: {
            fontSize: 10,
            color: theme.colors.secondary,
        },
    })

export default NightlyBuildBanner
