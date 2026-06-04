import { Dispatch, SetStateAction, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import {
    useFeeDisplayUtils,
    useStabilityPoolDepositFeeDetails,
} from '@fedi/common/hooks/transactions'
import {
    increaseStableBalance,
    selectFormattedDepositTime,
    setLastUsedFederationId,
} from '@fedi/common/redux'
import { Federation, Sats, SupportedCurrency } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { useAppSelector, useAppDispatch } from '../../../hooks'
import { keyframes, styled, theme } from '../../../styles'
import { Button } from '../../Button'
import { DetailsRow } from '../../DetailsRow'
import { Dialog } from '../../Dialog'
import { Column, Row } from '../../Flex'
import { Icon } from '../../Icon'
import { IconButton } from '../../IconButton'
import { Text } from '../../Text'
import { TourTip } from '../../TourTip'

type Props = {
    open: boolean
    onOpenChange: Dispatch<SetStateAction<boolean>>
    federationId: Federation['id']
    amount: Sats
    onSuccess(): void
}

const log = makeLog('StabilityConfirmDeposit')

export const ConfirmDepositDialog = ({
    open,
    onOpenChange,
    federationId,
    amount,
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
    const { formattedSats, formattedUsd } = makeFormattedAmountsFromSats(
        amount,
        'end',
    )
    const { formattedUsd: formattedUsdWithoutSymbol } =
        makeFormattedAmountsFromSats(amount, 'none')
    const { makeSPDepositFeeContent } = useFeeDisplayUtils(t, federationId)
    const amountMsats = amountUtils.satToMsat(amount)
    const feeDetails = useStabilityPoolDepositFeeDetails(
        amountMsats,
        federationId,
    )
    const feeContent = makeSPDepositFeeContent(feeDetails)
    const { formattedTotalFee } = feeContent

    const [showDetails, setShowDetails] = useState(false)
    const [tooltipOpen, setTooltipOpen] = useState(false)
    const [depositing, setDepositing] = useState(false)

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setShowDetails(false)
        }

        onOpenChange(nextOpen)
    }

    const handleDeposit = async () => {
        try {
            setDepositing(true)
            await dispatch(
                increaseStableBalance({
                    fedimint,
                    amount: amountMsats,
                    federationId,
                }),
            ).unwrap()

            dispatch(setLastUsedFederationId(federationId))

            onSuccess()
        } catch (error) {
            setDepositing(false)
            log.error('increaseStableBalance error', error)
            toast.error(t, error)
        }
    }

    return (
        <Dialog
            title={t('feature.stabilitypool.confirm-deposit')}
            open={open}
            onOpenChange={handleOpenChange}>
            <Column grow>
                <Row center gap="sm">
                    <Icon
                        icon="BitcoinCircle"
                        size="sm"
                        color={theme.colors.orange.toString()}
                    />
                    <Icon
                        icon="ArrowRight"
                        color={theme.colors.primaryLight.toString()}
                    />
                    <Icon
                        icon="UsdCircleFilled"
                        size="sm"
                        color={theme.colors.mint.toString()}
                    />
                </Row>
                <Column grow center>
                    <Row align="end" gap="sm">
                        <Text
                            variant="h1"
                            weight="bold"
                            css={{ lineHeight: 1 }}>
                            {formattedUsdWithoutSymbol}
                        </Text>
                        <Text>{SupportedCurrency.USD}</Text>
                    </Row>
                </Column>
                <Column gap="md">
                    {showDetails && (
                        <DetailsPanel>
                            <DetailsRow
                                label={t('feature.stabilitypool.deposit-from')}
                                value={t(
                                    'feature.stabilitypool.bitcoin-balance',
                                )}
                            />
                            <DetailsRow
                                label={t(
                                    'feature.stabilitypool.bitcoin-amount',
                                )}
                                value={formattedSats}
                            />
                            <DetailsRow
                                label={t('feature.stabilitypool.usd-amount')}
                                value={formattedUsd}
                            />
                            <DetailsRow
                                label={
                                    <Row align="center">
                                        {t('words.fees')}
                                        <TourTip
                                            open={tooltipOpen}
                                            onOpenChange={setTooltipOpen}
                                            side="bottom"
                                            content={
                                                <Text variant="caption">
                                                    {t(
                                                        'feature.fees.guidance-stable-balance',
                                                    )}
                                                </Text>
                                            }>
                                            <IconButton
                                                icon="Info"
                                                size="md"
                                                style={{
                                                    color: theme.colors.darkGrey.toString(),
                                                }}
                                                onClick={() =>
                                                    setTooltipOpen(true)
                                                }
                                            />
                                        </TourTip>
                                    </Row>
                                }
                                value={formattedTotalFee}
                            />
                            <DetailsRow
                                label={t('feature.stabilitypool.deposit-time')}
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
                            : t('feature.stabilitypool.details-and-fee')}
                    </Button>
                    <Button
                        width="full"
                        onClick={handleDeposit}
                        disabled={depositing}
                        loading={depositing}>
                        {t('words.deposit')}
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
