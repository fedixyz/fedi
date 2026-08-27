import { Text, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'

import { Column } from '../../ui/Flex'

/**
 * The unit beside the headline number. `useAmountFormatter` appends this same
 * literal, so the split headline and any inline sats amount stay in step.
 */
const SATS_UNIT = 'SATS'

/**
 * Centred sats headline with its fiat conversion underneath, as the payment
 * steps of the wallet service flow render a quoted total.
 */
export const AmountHeadline: React.FC<{
    satsNumber: string
    fiat: string
    /** Grey the number out while a fresh quote is loading behind it. */
    isStale?: boolean
    testID?: string
}> = ({ satsNumber, fiat, isStale = false, testID }) => {
    const { theme } = useTheme()
    const style = styles(theme)

    return (
        <Column align="center" justify="center" gap="xs">
            {/* Flex has no baseline option, so the amount and its unit sit in
                a plain baseline-aligned row */}
            <View style={style.amount}>
                <Text
                    style={[style.amountNumber, isStale && style.amountStale]}
                    testID={testID}>
                    {satsNumber}
                </Text>
                <Text style={[style.amountUnit, isStale && style.amountStale]}>
                    {SATS_UNIT}
                </Text>
            </View>
            <Text style={style.amountFiat}>{fiat}</Text>
        </Column>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        amount: {
            alignItems: 'baseline',
            flexDirection: 'row',
            gap: 6,
        },
        amountFiat: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 20,
        },
        amountNumber: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.h1,
            fontWeight: '500',
            lineHeight: 40,
        },
        amountStale: {
            color: theme.colors.grey,
        },
        amountUnit: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: '500',
            lineHeight: 24,
        },
    })
