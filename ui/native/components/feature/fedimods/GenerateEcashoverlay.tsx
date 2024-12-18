import { useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { RejectionError } from 'webln'

import { useMinMaxSendAmount, useRequestForm } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { selectActiveFederation } from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppSelector } from '../../../state/hooks'
import { EcashRequest, MSats } from '../../../types'
import AmountInput from '../../ui/AmountInput'
import CustomOverlay from '../../ui/CustomOverlay'

const log = makeLog('MakeInvoiceOverlay')

interface Props {
    ecashRequest?: EcashRequest | null
    onReject: (err: Error) => void
    onAccept: (ecash: string) => void
}

export const GenerateEcashOverlay: React.FC<Props> = ({
    ecashRequest,
    onReject,
    onAccept,
}) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const onRejectRef = useUpdatingRef(onReject)
    const onAcceptRef = useUpdatingRef(onAccept)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [amountInputKey, setAmountInputKey] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const { inputAmount, setInputAmount, minimumAmount, exactAmount, reset } =
        useRequestForm({ ecashRequest })
    // Ecash notes are generated from your current balance
    // Instead of an almost-unbound balance from useRequestForm, set the upper bound to the active user's balance
    const { maximumAmount } = useMinMaxSendAmount({
        selectedPaymentFederation: true,
    })

    // Reset form when it appears
    const isShowing = Boolean(ecashRequest)
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
            if (!activeFederation) throw new Error()
            const msats = amountUtils.satToMsat(inputAmount)

            const res = await fedimint.generateEcash(
                msats as MSats,
                activeFederation.id,
            )

            onAcceptRef.current(res.ecash)
        } catch (error) {
            log.error('Failed to generate ecash', error, ecashRequest)
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
                title: t('feature.stabilitypool.enter-deposit-amount'),
                body: (
                    <View
                        style={{
                            flex: 1,
                            paddingTop: theme.spacing.xl,
                            alignItems: 'center',
                            gap: theme.spacing.lg,
                        }}>
                        <AmountInput
                            key={amountInputKey}
                            amount={inputAmount}
                            isSubmitting={isLoading}
                            submitAttempts={submitAttempts}
                            minimumAmount={minimumAmount}
                            maximumAmount={maximumAmount}
                            readOnly={!!exactAmount}
                            verb={t('words.deposit')}
                            onChangeAmount={amount => {
                                setSubmitAttempts(0)
                                setInputAmount(amount)
                            }}
                        />
                    </View>
                ),
                buttons: [
                    {
                        text: t('words.cancel'),
                        onPress: handleReject,
                    },
                    {
                        primary: true,
                        text: t('words.confirm'),
                        onPress: handleAccept,
                    },
                ],
            }}
        />
    )
}
