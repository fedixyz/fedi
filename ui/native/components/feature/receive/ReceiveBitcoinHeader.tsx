import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import Header from '../../ui/Header'

const ReceiveBitcoinHeader: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()

    return (
        <Header
            backButton
            headerCenter={
                <Text bold numberOfLines={1} adjustsFontSizeToFit>
                    {t('feature.receive.request-bitcoin')}
                </Text>
            }
            rightContainerStyle={styles(theme).rightContainer}
        />
    )
}
const styles = (_theme: Theme) =>
    StyleSheet.create({
        rightContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
        },
    })

export default ReceiveBitcoinHeader
