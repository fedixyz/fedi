import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'

import {
    selectActiveFederation,
    selectCurrency,
    selectFederationBalance,
} from '@fedi/common/redux'

import { useAppSelector } from '../../../state/hooks'
import Flex from '../../ui/Flex'
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
        <Flex
            row
            align="start"
            justify="center"
            gap="xs"
            fullWidth
            style={style.container}>
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
        </Flex>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            padding: theme.spacing.sm,
            backgroundColor: '#FFFAEB', // TODO: add to theme.colors
        },
        text: {
            color: theme.colors.night,
        },
    })
