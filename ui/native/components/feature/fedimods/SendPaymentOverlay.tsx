import { useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { RejectionError } from 'webln'

import { useSendForm } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { selectPaymentFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { lnurlPay } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppSelector, useBridge } from '../../../state/hooks'
import { FediMod, Invoice, ParsedLnurlPay } from '../../../types'
import AmountInput from '../../ui/AmountInput'
import CustomOverlay from '../../ui/CustomOverlay'
import FederationWalletSelector from '../send/FederationWalletSelector'

const log = makeLog('SendPaymentOverlay')

interface Props {
    fediMod: FediMod
    invoice?: Invoice | null
    lnurlPayment?: ParsedLnurlPay['data'] | null
    onReject: (err: Error) => void
    onAccept: (res: { preimage: string }) => void
}

export const SendPaymentOverlay: React.FC<Props> = ({
    fediMod,
    invoice,
    lnurlPayment,
    onReject,
    onAccept,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const { payInvoice } = useBridge(paymentFederation?.id)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [amountInputKey, setAmountInputKey] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const onRejectRef = useUpdatingRef(onReject)
    const onAcceptRef = useUpdatingRef(onAccept)
    const {
        inputAmount,
        setInputAmount,
        exactAmount,
        minimumAmount,
        maximumAmount,
        reset,
    } = useSendForm({ invoice, lnurlPayment, t })

    // Reset form when it appears, requires a key bump to flush state.
    const isShowing = Boolean(invoice || lnurlPayment)
    useEffect(() => {
        if (isShowing) {
            reset()
            setAmountInputKey(key => key + 1)
        }
    }, [isShowing, reset])

    const handleAccept = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (inputAmount > maximumAmount || inputAmount < minimumAmount) {
            return
        }

        setIsLoading(true)
        try {
            if (!paymentFederation) throw new Error()
            if (invoice) {
                const res = await payInvoice(invoice.invoice)
                onAcceptRef.current(res)
            } else if (lnurlPayment) {
                const res = await lnurlPay(
                    fedimint,
                    paymentFederation.id,
                    lnurlPayment,
                    amountUtils.satToMsat(inputAmount),
                )
                onAcceptRef.current(res)
            }
        } catch (error) {
            log.error('Failed to pay invoice', invoice, error)
            toast.error(t, error)
            onRejectRef.current(error as Error)
        }
        setIsLoading(false)
    }

    const handleReject = () => {
        onRejectRef.current(
            new RejectionError(t('errors.webln-payment-rejected')),
        )
    }

    return (
        <CustomOverlay
            show={isShowing}
            loading={isLoading}
            onBackdropPress={() =>
                onReject(new RejectionError(t('errors.webln-canceled')))
            }
            contents={{
                title: t('feature.fedimods.payment-request', {
                    fediMod: fediMod.title,
                }),
                body: (
                    <View
                        style={{
                            flex: 1,
                            paddingTop: theme.spacing.xl,
                            alignItems: 'center',
                            gap: theme.spacing.lg,
                        }}>
                        <FederationWalletSelector />
                        <AmountInput
                            key={amountInputKey}
                            amount={inputAmount}
                            isSubmitting={isLoading}
                            submitAttempts={submitAttempts}
                            minimumAmount={minimumAmount}
                            maximumAmount={maximumAmount}
                            readOnly={!!exactAmount}
                            verb={t('words.send')}
                            onChangeAmount={amount => {
                                setSubmitAttempts(0)
                                setInputAmount(amount)
                            }}
                        />
                    </View>
                ),
                buttons: [
                    {
                        text: t('words.reject'),
                        onPress: handleReject,
                    },
                    {
                        primary: true,
                        text: t('words.accept'),
                        onPress: handleAccept,
                    },
                ],
            }}
        />
    )
}
