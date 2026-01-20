import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useCommonSelector } from '@fedi/common/hooks/redux'
import { selectCurrency, selectAmountInputType } from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'

import { Row } from './Flex'

export interface AmountInputDisplayProps {
    amount: Sats
    showFiat?: boolean
}

const AmountInputDisplay: React.FC<AmountInputDisplayProps> = ({
    amount,
    showFiat,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    const currency = useCommonSelector(selectCurrency)
    const lastInputType = useCommonSelector(selectAmountInputType)
    const isFiat = showFiat ?? lastInputType !== 'sats'

    const { makeFormattedAmountsFromSats } = useAmountFormatter({
        currency,
    })

    const { formattedFiat: fiatString, formattedSats: satsString } =
        makeFormattedAmountsFromSats(amount, 'none')

    const primary = isFiat ? fiatString : satsString
    const secondary = isFiat
        ? `${satsString} ${t('words.sats').toUpperCase()}`
        : `${fiatString} ${currency}`

    const label = isFiat ? currency : t('words.sats').toUpperCase()

    return (
        <View style={styles(theme).wrapper}>
            <Row
                align="end"
                justify="center"
                fullWidth
                style={styles(theme).primaryRow}>
                <Text h1 style={styles(theme).primaryText} adjustsFontSizeToFit>
                    {primary}
                </Text>
                <Text h2 numberOfLines={1} h2Style={styles(theme).labelText}>
                    {label}
                </Text>
            </Row>

            <Text caption style={styles(theme).secondaryText} numberOfLines={1}>
                {secondary}
            </Text>
        </View>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        wrapper: {
            width: '100%',
            paddingHorizontal: theme.spacing.lg,
        },
        primaryRow: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'center',
            width: '100%',
        },
        primaryText: {
            textAlign: 'center',
        },
        labelText: {
            marginLeft: theme.spacing.sm,
            marginBottom: 3,
            fontSize: 20,
        },
        secondaryText: {
            color: theme.colors.darkGrey,
            textAlign: 'center',
            marginTop: theme.spacing.xs,
        },
    })

export default AmountInputDisplay
