import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import Flex from '../../ui/Flex'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export const HistoryRowError: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <Flex row center style={style.container}>
            <View style={style.leftContainer}>
                <SvgImage
                    name="Error"
                    color={theme.colors.red}
                    size={SvgImageSize.md}
                />
            </View>
            <View style={style.centerContainer}>
                <Text>{t('errors.history-render-error')}</Text>
            </View>
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
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
        },
    })
