import { useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { RejectionError, RequestInvoiceArgs } from 'webln'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { generateInvoice, selectActiveFederationId } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { lnurlWithdraw } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import { FediMod, ParsedLnurlWithdraw } from '../../../types'
import AmountInput from '../../ui/AmountInput'
import CustomOverlay from '../../ui/CustomOverlay'

const log = makeLog('MakeInvoiceOverlay')

interface Props {
    fediMod: FediMod
    requestInvoiceArgs?: RequestInvoiceArgs | null
    lnurlWithdrawal?: ParsedLnurlWithdraw['data'] | null
    onReject: (err: Error) => void
    onAccept: (res: { paymentRequest: string }) => void
}

export const MakeInvoiceOverlay: React.FC<Props> = ({
    fediMod,
    requestInvoiceArgs,
    lnurlWithdrawal,
    onReject,
    onAccept,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const federationId = useAppSelector(selectActiveFederationId)
    const dispatch = useAppDispatch()
    const onRejectRef = useUpdatingRef(onReject)
    const onAcceptRef = useUpdatingRef(onAccept)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [amountInputKey, setAmountInputKey] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const {
        inputAmount,
        setInputAmount,
        memo,
        minimumAmount,
        maximumAmount,
        exactAmount,
        reset,
    } = useRequestForm({ requestInvoiceArgs, lnurlWithdrawal })

    // Reset form when it appears
    const isShowing = Boolean(requestInvoiceArgs || lnurlWithdrawal)
    useEffect(() => {
        if (isShowing) {
            reset()
            setSubmitAttempts(0)
            setAmountInputKey(key => key + 1)
            setIsLoading(false)
        }
    }, [isShowing, reset])

    const handleAccept = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (inputAmount > maximumAmount || inputAmount < minimumAmount) {
            return
        }

        try {
            setIsLoading(true)
            if (!federationId) throw new Error()
            const msats = amountUtils.satToMsat(inputAmount)
            const paymentRequest = lnurlWithdrawal
                ? await lnurlWithdraw(
                      fedimint,
                      federationId,
                      lnurlWithdrawal,
                      msats,
                      memo,
                  )
                : await dispatch(
                      generateInvoice({
                          fedimint,
                          federationId,
                          amount: msats,
                          description: memo,
                      }),
                  ).unwrap()
            onAcceptRef.current({ paymentRequest })
        } catch (error) {
            log.error('Failed to generate invoice', error, lnurlWithdrawal)
            toast.error(t, error)
            onRejectRef.current(error as Error)
        }
    }

    const handleReject = () => {
        onRejectRef.current(
            new RejectionError(t('errors.webln-payment-request-rejected')),
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
                title: exactAmount
                    ? t('feature.fedimods.wants-to-send-you', {
                          fediMod: fediMod.title,
                      })
                    : t('feature.fedimods.enter-amount-to-withdraw', {
                          fediMod: fediMod.title,
                      }),
                description: requestInvoiceArgs?.defaultMemo || '',
                body: (
                    <View style={{ flex: 1, paddingTop: theme.spacing.xl }}>
                        <AmountInput
                            key={amountInputKey}
                            amount={inputAmount}
                            isSubmitting={isLoading}
                            submitAttempts={submitAttempts}
                            minimumAmount={minimumAmount}
                            maximumAmount={maximumAmount}
                            readOnly={!!exactAmount}
                            verb={t('words.request')}
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
