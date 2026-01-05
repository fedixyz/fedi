import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { RejectionError } from 'webln'

import { useFedimint } from '@fedi/common/hooks/fedimint'
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
    setSuggestedPaymentFederation,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { lnurlPay } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

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
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { feeBreakdownTitle, makeLightningFeeContent } = useFeeDisplayUtils(
        t,
        paymentFederation?.id || '',
    )
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
    const fedimint = useFedimint()
    const {
        inputAmount,
        setInputAmount,
        exactAmount,
        minimumAmount,
        maximumAmount,
        resetOmniPaymentState,
        feeDetails,
        handleOmniInput,
        isLoading: isOmniPaymentLoading,
    } = useOmniPaymentState(paymentFederation?.id, t)

    const { formattedTotalFee, feeItemsBreakdown } = useMemo(() => {
        return feeDetails
            ? makeLightningFeeContent(feeDetails)
            : { feeItemsBreakdown: [], formattedTotalFee: '' }
    }, [feeDetails, makeLightningFeeContent])

    // Reset form when it appears, requires a key bump to flush state.
    const isShowing = Boolean(invoice || lnurlPayment)

    useEffect(() => {
        if (isShowing) {
            // makes sure we auto-select a wallet to pay from if the user doesn't have one selected
            dispatch(setSuggestedPaymentFederation())

            resetOmniPaymentState()
            setAmountInputKey(key => key + 1)
            setError(null)
        }
    }, [isShowing, resetOmniPaymentState, dispatch])

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
                        {isOmniPaymentLoading ? (
                            <ActivityIndicator />
                        ) : (
                            <>
                                {exactAmount ? (
                                    <AmountInputDisplay amount={inputAmount} />
                                ) : lnurlPayment ? (
                                    // only show amount input for LNURL-pay, amount-less bolt11 invoices are not supported yet
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
                                ) : null}
                                {formattedTotalFee !== '' && (
                                    <Flex fullWidth>
                                        <SendPreviewDetails
                                            onPressFees={() =>
                                                setShowFeeBreakdown(true)
                                            }
                                            formattedTotalFee={
                                                formattedTotalFee
                                            }
                                            senderText={t(
                                                'feature.stabilitypool.bitcoin-balance',
                                            )}
                                            isLoading={isLoading}
                                        />
                                    </Flex>
                                )}
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
                            </>
                        )}
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
