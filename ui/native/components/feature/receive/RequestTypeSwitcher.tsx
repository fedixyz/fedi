import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { BitcoinOrLightning } from '../../../types'
import SvgImage from '../../ui/SvgImage'

export type Props = {
    requestType: BitcoinOrLightning
    onSwitch: () => void
}

const RequestTypeSwitcher: React.FC<Props> = ({ requestType, onSwitch }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    return (
        <Pressable style={styles(theme).container} onPress={onSwitch}>
            <Text caption>
                {requestType === BitcoinOrLightning.lightning
                    ? t('words.lightning')
                    : t('words.onchain')}
            </Text>
            {requestType === BitcoinOrLightning.lightning ? (
                <SvgImage name="SwitchLeft" />
            ) : (
                <SvgImage name="SwitchRight" />
            )}
        </Pressable>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            marginTop: theme.spacing.lg,
        },
    })

export default RequestTypeSwitcher
