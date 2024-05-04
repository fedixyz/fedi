import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { View, StyleSheet } from 'react-native'

import {
    selectActiveFederation,
    selectCurrency,
    selectFederationBalance,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import SvgImage, { SvgImageSize } from '../../ui/SvgImage'

export const StabilityBitcoinBanner: React.FC = () => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const currency = useAppSelector(selectCurrency)
    const activeFederation = useAppSelector(selectActiveFederation)
    const balance = useAppSelector(selectFederationBalance)

    if (!activeFederation || balance > 0) return null

    const style = styles(theme)

    return (
        <View style={style.container}>
            <SvgImage
                color={theme.colors.night}
                name="Info"
                size={SvgImageSize.xs}
            />
            <Text small medium style={style.text}>
                {t('feature.stabilitypool.no-bitcoin-notice', {
                    currency,
                })}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: theme.spacing.sm,
            gap: theme.spacing.xs,
            backgroundColor: '#FFFAEB', // TODO: add to theme.colors
        },
        text: {
            color: theme.colors.night,
        },
    })
