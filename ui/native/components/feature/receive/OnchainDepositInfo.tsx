import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

const OnchainDepositInfo: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    const style = styles(theme)

    return (
        <View style={style.container}>
            <Text bold style={style.warningText}>
                {t('feature.receive.onchain-expert-only')}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        warningText: {
            color: theme.colors.red,
            textAlign: 'center',
        },
    })

export default OnchainDepositInfo
