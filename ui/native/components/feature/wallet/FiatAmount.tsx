import { Text, TextProps, Theme, useTheme } from '@rneui/themed'
import React from 'react'
import { StyleSheet } from 'react-native'

import { useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { Sats } from '@fedi/common/types'

type FiatAmountProps = {
    amountSats?: Sats
    textProps?: TextProps
}

const DEFAULT_TEXT_PROPS = {
    medium: true,
}

const FiatAmount = ({
    amountSats,
    textProps = DEFAULT_TEXT_PROPS,
}: FiatAmountProps) => {
    const { theme } = useTheme()
    const { convertSatsToFormattedFiat } = useBtcFiatPrice()

    let convertedAmount = '0.00'
    if (amountSats) {
        convertedAmount = convertSatsToFormattedFiat(amountSats)
    }

    const mergedTextProps = {
        ...DEFAULT_TEXT_PROPS,
        ...textProps,
        style: [
            styles(theme).defaultText,
            textProps.style ? textProps.style : {},
        ],
    }

    return <Text {...mergedTextProps}>{`${convertedAmount}`}</Text>
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        defaultText: {
            color: theme.colors.darkGrey,
            textAlign: 'center',
        },
    })

export default FiatAmount
