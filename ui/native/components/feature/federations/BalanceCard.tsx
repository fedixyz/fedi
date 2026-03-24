import { useNavigation } from '@react-navigation/native'
import { Text, Theme, useTheme } from '@rneui/themed'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet } from 'react-native'

import { useBalance } from '@fedi/common/hooks/amount'
import { selectCurrency, selectPaymentType } from '@fedi/common/redux'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import { useAppSelector, useStabilityPool } from '../../../state/hooks'
import { Column, Row } from '../../ui/Flex'
import GradientView from '../../ui/GradientView'
import SvgImage, { SvgImageName } from '../../ui/SvgImage'

export default function WalletBalanceCard({
    federationId,
}: {
    federationId: string
}) {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { formattedBalanceSats, formattedBalanceFiat } = useBalance(
        t,
        federationId,
    )
    const { formattedStableBalance, formattedStableBalanceSats } =
        useStabilityPool(federationId)

    const navigation = useNavigation()
    const paymentType = useAppSelector(selectPaymentType)
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federationId),
    )

    const onPressTransactions = () => {
        navigation.navigate(
            paymentType === 'bitcoin' ? 'Transactions' : 'StabilityHistory',
            { federationId },
        )
    }

    let iconName: SvgImageName = 'BitcoinCircle'
    let iconColor = theme.colors.orange
    let headerTitle = t('words.bitcoin')
    let primaryAmount = formattedBalanceFiat
    let secondaryAmount = formattedBalanceSats

    if (paymentType === 'stable-balance') {
        iconName = 'UsdCircleFilled'
        iconColor = theme.colors.moneyGreen
        headerTitle = getCurrencyCode(selectedCurrency)
        primaryAmount = formattedStableBalance
        secondaryAmount = `${formattedStableBalanceSats} ${t('words.sats').toUpperCase()}`
    }

    const style = styles(theme)

    return (
        <GradientView style={style.card} variant="white">
            <Pressable
                onPress={onPressTransactions}
                style={style.header}
                hitSlop={12}
                testID="BalanceCard__TransactionHistory">
                <Row gap="sm" align="center">
                    <SvgImage name={iconName} color={iconColor} />
                    <Text bold>{headerTitle}</Text>
                </Row>

                <SvgImage name="TxnHistory" />
            </Pressable>
            <Column center gap="xs" grow>
                <Text bold h1>
                    {primaryAmount}
                </Text>
                {secondaryAmount && (
                    <Text color={theme.colors.grey}>{secondaryAmount}</Text>
                )}
            </Column>
        </GradientView>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        card: {
            backgroundColor: theme.colors.white,
            flexDirection: 'column',
            flexGrow: 1,
            padding: theme.spacing.md,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.extraLightGrey,
        },
    })
