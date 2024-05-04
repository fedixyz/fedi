import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import SvgImage, { SvgImageSize } from './SvgImage'

export const HistoryRowError: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <View style={styles(theme).container}>
            <View style={styles(theme).leftContainer}>
                <SvgImage
                    name="Error"
                    color={theme.colors.red}
                    size={SvgImageSize.md}
                />
            </View>
            <View style={styles(theme).centerContainer}>
                <Text>{t('errors.history-render-error')}</Text>
            </View>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            height: 48,
            backgroundColor: theme.colors.secondary,
            paddingHorizontal: theme.spacing.xl,
            marginVertical: theme.spacing.md,
        },
        leftContainer: {
            width: '10%',
        },
        centerContainer: {
            width: '90%',
            paddingHorizontal: theme.spacing.sm,
            flexDirection: 'column',
        },
        rightContainer: {
            width: '30%',
            flexDirection: 'column',
            justifyContent: 'flex-end',
        },
        rightAlignedText: {
            textAlign: 'right',
        },
        subText: {
            fontSize: theme.sizes.xxs,
            color: theme.colors.primaryLight,
        },
    })
