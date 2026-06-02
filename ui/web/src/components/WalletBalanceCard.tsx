import { useRouter } from 'next/router'
import { useTranslation } from 'react-i18next'

import { HIDDEN_AMOUNT_MASK } from '@fedi/common/constants/currency'
import { useBalance } from '@fedi/common/hooks/amount'
import { useRecoveryProgress } from '@fedi/common/hooks/recovery'
import {
    selectBalanceDisplay,
    selectCurrency,
    selectPaymentType,
    selectStableBalancePending,
} from '@fedi/common/redux'
import { getCurrencyCode } from '@fedi/common/utils/currency'

import { HoloLoader } from '../components/HoloLoader'
import { Icon, SvgIconName } from '../components/Icon'
import { Text } from '../components/Text'
import { transactionsRoute } from '../constants/routes'
import { useAppSelector, useStabilityPoolWithMountRefresh } from '../hooks'
import { styled, theme } from '../styles'
import { Column, Row } from './Flex'

type Props = {
    federationId: string
}

export const WalletBalanceCard: React.FC<Props> = ({ federationId }) => {
    const { t } = useTranslation()
    const router = useRouter()

    const { formattedBalanceSats, formattedBalanceFiat } = useBalance(
        t,
        federationId,
    )
    const balanceDisplay = useAppSelector(selectBalanceDisplay)
    const { formattedPercent, recoveryInProgress } =
        useRecoveryProgress(federationId)
    const { formattedStableBalance, formattedStableBalancePending } =
        useStabilityPoolWithMountRefresh(federationId)
    const stableBalancePending = useAppSelector(s =>
        selectStableBalancePending(s, federationId),
    )
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, federationId),
    )
    const paymentType = useAppSelector(selectPaymentType)

    let iconName: SvgIconName = 'BitcoinCircle'
    let iconColor: string = theme.colors.orange.toString()
    let walletLabel: string = t('words.bitcoin')
    let primaryAmount = formattedBalanceFiat
    let secondaryAmount: string | null = formattedBalanceSats

    if (paymentType === 'stable-balance') {
        iconName = 'UsdCircleFilled'
        iconColor = theme.colors.moneyGreen.toString()
        walletLabel = getCurrencyCode(selectedCurrency)
        primaryAmount = formattedStableBalance
        secondaryAmount =
            stableBalancePending !== 0
                ? `${formattedStableBalancePending} ${t('words.pending')}`
                : null
    }

    return (
        <BalanceCard>
            <BalanceHeader
                onClick={() =>
                    router.push(`${transactionsRoute}#id=${federationId}`)
                }>
                <Row gap="sm" align="center">
                    <Icon icon={iconName} color={iconColor} />
                    <Text weight="bold">{walletLabel}</Text>
                </Row>

                <Icon icon="TxnHistory" size="sm" />
            </BalanceHeader>
            <Column center gap="xs" grow>
                {recoveryInProgress ? (
                    <Column center gap="xs">
                        <HoloLoader size={40} label="" />
                        <Text css={{ color: theme.colors.grey }}>
                            {formattedPercent}
                        </Text>
                    </Column>
                ) : (
                    <>
                        <Text weight="bold" variant="h1">
                            {balanceDisplay === 'hidden'
                                ? HIDDEN_AMOUNT_MASK
                                : primaryAmount}
                        </Text>
                        {secondaryAmount && (
                            <Text css={{ color: theme.colors.grey }}>
                                {balanceDisplay === 'hidden'
                                    ? HIDDEN_AMOUNT_MASK
                                    : secondaryAmount}
                            </Text>
                        )}
                    </>
                )}
            </Column>
        </BalanceCard>
    )
}

const BalanceCard = styled('div', {
    backgroundColor: theme.colors.white,
    fediGradient: 'white',
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.extraLightGrey}`,
    borderRadius: 16,
})

const BalanceHeader = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
})
