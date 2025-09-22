import { Text, Theme, useTheme } from '@rneui/themed'
import { StyleSheet, View } from 'react-native'

import { hexToRgba } from '@fedi/common/utils/color'

export type Props = {
    showBalance?: boolean
    subHeader?: React.ReactNode
    balanceDisplay?: string
    formattedPrimaryAmount: string | React.ReactNode
    formattedSecondaryAmount?: string
}

const SendAmounts: React.FC<Props> = ({
    showBalance = false,
    balanceDisplay,
    formattedPrimaryAmount,
    formattedSecondaryAmount,
    subHeader = null,
}) => {
    const { theme } = useTheme()

    const style = styles(theme)
    return (
        <>
            <View style={style.header}>
                {subHeader}
                {showBalance && balanceDisplay && (
                    <Text
                        caption
                        style={style.balance}
                        numberOfLines={1}
                        adjustsFontSizeToFit>
                        {`${balanceDisplay} `}
                    </Text>
                )}
            </View>
            <View style={style.amountContainer}>
                {typeof formattedPrimaryAmount === 'string' ? (
                    <Text h1 medium numberOfLines={1}>
                        {formattedPrimaryAmount}
                    </Text>
                ) : (
                    formattedPrimaryAmount
                )}
                {formattedSecondaryAmount && (
                    <Text
                        style={style.secondaryAmountText}
                        medium
                        numberOfLines={1}>
                        {formattedSecondaryAmount}
                    </Text>
                )}
            </View>
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        header: {
            paddingTop: theme.spacing.sm,
        },
        amountContainer: {
            marginTop: 'auto',
        },
        balance: {
            color: hexToRgba(theme.colors.primary, 0.6),
            textAlign: 'center',
        },
        secondaryAmountText: {
            color: theme.colors.darkGrey,
            textAlign: 'center',
            marginRight: theme.spacing.xs,
            marginTop: theme.spacing.xs,
        },
    })

export default SendAmounts
