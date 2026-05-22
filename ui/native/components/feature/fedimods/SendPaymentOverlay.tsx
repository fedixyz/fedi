import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { RejectionError } from 'webln'

import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    selectFederationBalance,
    selectInvoiceToPay,
    selectLnurlPayment,
    selectPaymentFederation,
    selectSiteInfo,
    setSuggestedPaymentFederation,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { ParserDataType } from '../../../types'
import AmountInput from '../../ui/AmountInput'
import CustomOverlay from '../../ui/CustomOverlay'
import { Column } from '../../ui/Flex'
import LineBreak from '../../ui/LineBreak'
import SvgImage from '../../ui/SvgImage'
import FederationWalletSelector from '../send/FederationWalletSelector'
import FeeOverlay from '../send/FeeOverlay'
import SendPreviewDetails from '../send/SendPreviewDetails'

interface Props {
    onReject: (err: Error) => void
    onAccept: (res: { preimage: string }) => void
}

export const SendPaymentOverlay: React.FC<Props> = ({ onReject, onAccept }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federationId = paymentFederation?.id ?? ''
    const { feeBreakdownTitle, makeLightningFeeContent } = useFeeDisplayUtils(
        t,
        federationId,
    )
    const lnurlPayment = useAppSelector(selectLnurlPayment)
    const invoice = useAppSelector(selectInvoiceToPay)
    const balance = useAppSelector(s =>
        selectFederationBalance(s, federationId),
    )
    const siteInfo = useAppSelector(selectSiteInfo)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [amountInputKey, setAmountInputKey] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
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
        resetOmniPaymentState,
        feeDetails,
        handleOmniInput,
        handleOmniSend,
        isLoading: isOmniPaymentLoading,
        error,
        isReadyToPay,
    } = useOmniPaymentState(federationId, t)

    const { formattedTotalFee, feeItemsBreakdown } = useMemo(() => {
        return feeDetails
            ? makeLightningFeeContent(feeDetails)
            : { feeItemsBreakdown: [], formattedTotalFee: '' }
    }, [feeDetails, makeLightningFeeContent])

    // Reset form when it appears, requires a key bump to flush state.
    const isShowing = Boolean(invoice || lnurlPayment)

    const hasInsufficientBalance = amountUtils.msatToSat(balance) < inputAmount

    useEffect(() => {
        if (!isShowing) return

        // makes sure we auto-select a wallet to pay from if the user doesn't have one selected
        if (!federationId) {
            dispatch(setSuggestedPaymentFederation())
            return
        }

        resetOmniPaymentState()
        setAmountInputKey(key => key + 1)
    }, [isShowing, resetOmniPaymentState, dispatch, federationId])

    useEffect(() => {
        if (!invoice) return

        handleOmniInput({
            type: ParserDataType.Bolt11,
            data: invoice,
        })
    }, [handleOmniInput, invoice])

    const handleAccept = () => {
        setSubmitAttempts(attempts => attempts + 1)
        setIsLoading(true)
        handleOmniSend(inputAmount)
            .then(res => {
                onAcceptRef.current(res as { preimage: string })
            })
            .catch(() => {
                /* no-op, handled within `handleOmniSend` already */
            })
            .finally(() => setIsLoading(false))
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
                    <Column
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
                                <AmountInput
                                    key={amountInputKey}
                                    amount={inputAmount}
                                    isSubmitting={isLoading}
                                    submitAttempts={submitAttempts}
                                    minimumAmount={minimumAmount}
                                    maximumAmount={maximumAmount}
                                    readOnly={!!exactAmount}
                                    verb={t('words.send')}
                                    onChangeAmount={amt => {
                                        setSubmitAttempts(0)
                                        setInputAmount(amt)
                                    }}
                                    error={
                                        hasInsufficientBalance
                                            ? t(
                                                  'errors.insufficient-balance-wallet',
                                              )
                                            : error
                                    }
                                />
                                {formattedTotalFee !== '' && (
                                    <Column fullWidth>
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
                                    </Column>
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
                    </Column>
                ),
                buttons: [
                    {
                        text: t('words.reject'),
                        onPress: handleReject,
                    },
                    {
                        primary: true,
                        text: t('words.accept'),
                        disabled: !isReadyToPay || isLoading,
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
