import { Dispatch, SetStateAction, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter, useBtcFiatPrice } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    selectFormattedDepositTime,
    setLastUsedFederationId,
    decreaseStableBalanceV1,
    decreaseStableBalanceV2,
    selectStabilityPoolVersion,
} from '@fedi/common/redux'
import {
    Federation,
    Sats,
    SupportedCurrency,
    UsdCents,
} from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { useAppSelector, useAppDispatch } from '../../../hooks'
import { keyframes, styled, theme } from '../../../styles'
import { Button } from '../../Button'
import { DetailsRow } from '../../DetailsRow'
import { Dialog } from '../../Dialog'
import { Column, Row } from '../../Flex'
import { Icon } from '../../Icon'
import { Text } from '../../Text'

type Props = {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
    federationId: Federation['id']
    amountSats: Sats
    amountCents: UsdCents
    onSuccess(formattedAmount: string): void
}

const log = makeLog('StabilityConfirmWithdraw')

export const ConfirmWithdrawDialog = ({
    open,
    onOpenChange,
    federationId,
    amountSats,
    amountCents,
    onSuccess,
}: Props) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()

    const depositTime = useAppSelector(s =>
        selectFormattedDepositTime(s, federationId, t),
    )

    const { makeFormattedAmountsFromSats } = useAmountFormatter({
        federationId,
    })
    const { convertCentsToFormattedFiat } = useBtcFiatPrice(
        SupportedCurrency.USD,
        federationId,
    )
    const version = useAppSelector(s =>
        selectStabilityPoolVersion(s, federationId),
    )
    const formattedUsd =
        version === 2
            ? convertCentsToFormattedFiat(amountCents, 'none')
            : makeFormattedAmountsFromSats(amountSats, 'none').formattedUsd
    const formattedSuccessAmount = `${formattedUsd} ${SupportedCurrency.USD}`

    const [showDetails, setShowDetails] = useState(false)
    const [withdrawing, setWithdrawing] = useState(false)

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setShowDetails(false)
        }

        onOpenChange(nextOpen)
    }

    const handleWithdraw = async () => {
        try {
            setWithdrawing(true)
            if (version === 2) {
                await dispatch(
                    decreaseStableBalanceV2({
                        fedimint,
                        amount: amountCents,
                        federationId,
                    }),
                ).unwrap()
            } else {
                const amountMsats = amountUtils.satToMsat(amountSats)
                await dispatch(
                    decreaseStableBalanceV1({
                        fedimint,
                        amount: amountMsats,
                        federationId,
                    }),
                ).unwrap()
            }
            dispatch(setLastUsedFederationId(federationId))

            onSuccess(formattedSuccessAmount)
        } catch (error) {
            setWithdrawing(false)
            log.error('decreaseStableBalance error', error)
            toast.error(t, error)
        }
    }

    return (
        <Dialog
            title={t('feature.stabilitypool.confirm-withdrawal')}
            open={open}
            onOpenChange={handleOpenChange}>
            <Column grow>
                <Row center gap="sm">
                    <Icon
                        icon="UsdCircleFilled"
                        size="sm"
                        color={theme.colors.mint.toString()}
                    />
                    <Icon
                        icon="ArrowRight"
                        color={theme.colors.primaryLight.toString()}
                    />
                    <Icon
                        icon="BitcoinCircle"
                        size="sm"
                        color={theme.colors.orange.toString()}
                    />
                </Row>
                <Column grow center gap="sm">
                    <Row align="end" gap="sm">
                        <Text
                            variant="h1"
                            weight="bold"
                            css={{ lineHeight: 1 }}>
                            {formattedUsd}
                        </Text>
                        <Text>{SupportedCurrency.USD}</Text>
                    </Row>
                    <Text css={{ color: theme.colors.darkGrey }}>
                        {t(
                            'feature.stabilitypool.amount-may-vary-during-withdraw',
                        )}
                    </Text>
                </Column>
                <Column gap="md">
                    {showDetails && (
                        <DetailsPanel>
                            <DetailsRow
                                label={t('feature.stabilitypool.withdraw-to')}
                                value={t(
                                    'feature.stabilitypool.bitcoin-balance',
                                )}
                            />
                            <DetailsRow label={t('words.fees')} value="0%" />
                            <DetailsRow
                                label={t(
                                    'feature.stabilitypool.withdrawal-time',
                                )}
                                value={depositTime}
                            />
                        </DetailsPanel>
                    )}
                    <Button
                        variant="secondary"
                        width="full"
                        onClick={() => setShowDetails(!showDetails)}>
                        {showDetails
                            ? t('phrases.hide-details')
                            : t('words.details')}
                    </Button>
                    <Button
                        width="full"
                        onClick={handleWithdraw}
                        disabled={withdrawing}
                        loading={withdrawing}>
                        {t('words.withdraw')}
                    </Button>
                </Column>
            </Column>
        </Dialog>
    )
}

const detailsSlideUp = keyframes({
    '0%': {
        opacity: 0,
        transform: 'translateY(12px)',
    },
    '100%': {
        opacity: 1,
        transform: 'translateY(0)',
    },
})

const DetailsPanel = styled(Column, {
    animation: `${detailsSlideUp} 180ms ease-out both`,
    willChange: 'opacity, transform',
})
