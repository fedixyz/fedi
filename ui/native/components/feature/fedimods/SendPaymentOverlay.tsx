import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { StyleSheet } from 'react-native'
import { RejectionError } from 'webln'

import { useSendForm } from '@fedi/common/hooks/amount'
import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    listGateways,
    payInvoice,
    selectInvoiceToPay,
    selectLnurlPayment,
    selectPaymentFederation,
    selectSiteInfo,
    selectWalletFederations,
    setPayFromFederationId,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { lnurlPay } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { MSats, ParserDataType } from '../../../types'
import AmountInput from '../../ui/AmountInput'
import AmountInputDisplay from '../../ui/AmountInputDisplay'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import LineBreak from '../../ui/LineBreak'
import SvgImage from '../../ui/SvgImage'
import FederationWalletSelector from '../send/FederationWalletSelector'
import FeeOverlay from '../send/FeeOverlay'
import SendPreviewDetails from '../send/SendPreviewDetails'

const log = makeLog('SendPaymentOverlay')

interface Props {
    onReject: (err: Error) => void
    onAccept: (res: { preimage: string }) => void
}

export const SendPaymentOverlay: React.FC<Props> = ({ onReject, onAccept }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const { feeBreakdownTitle, makeLightningFeeContent } = useFeeDisplayUtils(t)
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const walletFederations = useAppSelector(selectWalletFederations)
    const lnurlPayment = useAppSelector(selectLnurlPayment)
    const invoice = useAppSelector(selectInvoiceToPay)
    const siteInfo = useAppSelector(selectSiteInfo)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [amountInputKey, setAmountInputKey] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showFeeBreakdown, setShowFeeBreakdown] = useState<boolean>(false)
    const onRejectRef = useUpdatingRef(onReject)
    const onAcceptRef = useUpdatingRef(onAccept)
    const dispatch = useAppDispatch()
    const {
        inputAmount,
        setInputAmount,
        exactAmount,
        minimumAmount,
        maximumAmount,
        reset,
    } = useSendForm({
        invoice,
        lnurlPayment,
        t,
        selectedPaymentFederation: true,
    })
    const { feeDetails, handleOmniInput } = useOmniPaymentState(
        fedimint,
        paymentFederation?.id,
        true,
        t,
    )
    const { formattedTotalFee, feeItemsBreakdown } = useMemo(() => {
        return feeDetails
            ? makeLightningFeeContent(feeDetails)
            : { feeItemsBreakdown: [], formattedTotalFee: '' }
    }, [feeDetails, makeLightningFeeContent])

    // Reset form when it appears, requires a key bump to flush state.
    const isShowing = Boolean(invoice || lnurlPayment)

    useEffect(() => {
        if (isShowing) {
            // If no payment federation is set (e.g. your active federation is a non-wallet community), find and select the best possible wallet federation
            if (!paymentFederation) {
                const firstWalletFederation = walletFederations
                    // Sort by balance
                    .sort((a, b) => b.balance - a.balance)
                    // Prioritize mainnet federations
                    .sort(
                        (a, b) =>
                            // Resolves to either 0 or 1 for true/false
                            // Sorts in descending order by network === bitcoin - network !== bitcoin
                            Number(b.network === 'bitcoin') -
                            Number(a.network === 'bitcoin'),
                    )[0]

                dispatch(
                    setPayFromFederationId(firstWalletFederation?.id ?? null),
                )
            }

            reset()
            setAmountInputKey(key => key + 1)
            setError(null)
        }
    }, [isShowing, reset, paymentFederation, walletFederations, dispatch])

    useEffect(() => {
        if (!invoice) return

        handleOmniInput({
            type: ParserDataType.Bolt11,
            data: invoice,
        })
    }, [handleOmniInput, invoice])

    useEffect(() => {
        if (maximumAmount === 0) {
            setError(t('errors.please-select-balance-federation'))
        }
    }, [maximumAmount, t])

    const handleAccept = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (inputAmount > maximumAmount || inputAmount < minimumAmount) {
            return
        }

        setIsLoading(true)
        try {
            if (!paymentFederation) throw new Error()

            const gateways = await dispatch(
                listGateways({ fedimint, federationId: paymentFederation.id }),
            ).unwrap()

            if (!gateways.length) {
                throw new Error('No available lightning gateways')
            }

            if (invoice) {
                if (paymentFederation.balance < invoice.amount) {
                    throw new Error(
                        t('errors.insufficient-balance', {
                            balance: `${amountUtils.msatToSat(
                                paymentFederation.balance as MSats,
                            )} SATS`,
                        }),
                    )
                }

                const res = await dispatch(
                    payInvoice({
                        fedimint,
                        federationId: paymentFederation.id,
                        invoice: invoice.invoice,
                        // TODO: add notes?
                        // Maybe include the fedimod by default?
                    }),
                ).unwrap()
                onAcceptRef.current(res)
            } else if (lnurlPayment) {
                await lnurlPay(
                    fedimint,
                    paymentFederation.id,
                    lnurlPayment,
                    amountUtils.satToMsat(inputAmount),
                ).match(onAcceptRef.current, e => {
                    // TODO: do not throw
                    throw e
                })
            }
        } catch (err) {
            log.error('Failed to pay invoice', invoice, err)

            setError(formatErrorMessage(t, err, 'errors.unknown-error'))
        }
        setIsLoading(false)
    }

    const handleReject = () => {
        onRejectRef.current(
            new RejectionError(t('errors.webln-payment-rejected')),
        )
    }

    const style = styles(theme)

    return (
        <CustomOverlay
            show={isShowing}
            loading={isLoading}
            onBackdropPress={() =>
                onReject(new RejectionError(t('errors.webln-canceled')))
            }
            contents={{
                title: t('feature.fedimods.payment-request', {
                    fediMod: siteInfo?.title,
                }),
                body: (
                    <Flex
                        grow
                        align="center"
                        gap="lg"
                        fullWidth
                        style={style.container}>
                        <FederationWalletSelector />
                        {exactAmount ? (
                            <AmountInputDisplay amount={inputAmount} />
                        ) : (
                            <AmountInput
                                key={amountInputKey}
                                amount={inputAmount}
                                isSubmitting={isLoading}
                                submitAttempts={submitAttempts}
                                minimumAmount={minimumAmount}
                                maximumAmount={maximumAmount}
                                verb={t('words.send')}
                                onChangeAmount={amt => {
                                    setSubmitAttempts(0)
                                    setInputAmount(amt)
                                }}
                                error={error}
                            />
                        )}
                        <Flex fullWidth>
                            <SendPreviewDetails
                                onPressFees={() => setShowFeeBreakdown(true)}
                                formattedTotalFee={formattedTotalFee}
                                senderText={t(
                                    'feature.stabilitypool.bitcoin-balance',
                                )}
                                isLoading={isLoading}
                            />
                        </Flex>
                        <FeeOverlay
                            show={showFeeBreakdown}
                            onDismiss={() => setShowFeeBreakdown(false)}
                            title={feeBreakdownTitle}
                            feeItems={feeItemsBreakdown}
                            description={
                                <Trans
                                    t={t}
                                    i18nKey="feature.fees.guidance-lightning"
                                    components={{
                                        br: <LineBreak />,
                                    }}
                                />
                            }
                            icon={
                                <SvgImage
                                    name="Info"
                                    size={32}
                                    color={theme.colors.orange}
                                />
                            }
                        />
                    </Flex>
                ),
                buttons: [
                    {
                        text: t('words.reject'),
                        onPress: handleReject,
                    },
                    {
                        primary: true,
                        text: t('words.accept'),
                        disabled:
                            !!error ||
                            inputAmount < minimumAmount ||
                            inputAmount > maximumAmount,
                        onPress: handleAccept,
                    },
                ],
            }}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        container: {
            paddingTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.md,
        },
    })
