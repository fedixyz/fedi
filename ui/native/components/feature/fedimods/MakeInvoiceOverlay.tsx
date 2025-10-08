import { useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RejectionError } from 'webln'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    generateInvoice,
    listGateways,
    selectLnurlWithdrawal,
    selectPaymentFederation,
    selectRequestInvoiceArgs,
    selectSiteInfo,
} from '@fedi/common/redux'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { lnurlWithdraw } from '@fedi/common/utils/lnurl'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../../../bridge'
import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import AmountInput from '../../ui/AmountInput'
import AmountInputDisplay from '../../ui/AmountInputDisplay'
import CustomOverlay from '../../ui/CustomOverlay'
import Flex from '../../ui/Flex'
import FederationWalletSelector from '../send/FederationWalletSelector'

const log = makeLog('MakeInvoiceOverlay')

interface Props {
    onReject: (err: Error) => void
    onAccept: (res: { paymentRequest: string }) => void
}

export const MakeInvoiceOverlay: React.FC<Props> = ({ onReject, onAccept }) => {
    const { t } = useTranslation()
    const { theme } = useTheme()
    const paymentFederation = useAppSelector(selectPaymentFederation)
    const dispatch = useAppDispatch()
    const lnurlWithdrawal = useAppSelector(selectLnurlWithdrawal)
    const requestInvoiceArgs = useAppSelector(selectRequestInvoiceArgs)
    const siteInfo = useAppSelector(selectSiteInfo)
    const onRejectRef = useUpdatingRef(onReject)
    const onAcceptRef = useUpdatingRef(onAccept)
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [amountInputKey, setAmountInputKey] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const {
        inputAmount,
        setInputAmount,
        memo,
        minimumAmount,
        maximumAmount,
        exactAmount,
        reset,
    } = useRequestForm({
        requestInvoiceArgs,
        lnurlWithdrawal,
        federationId: paymentFederation?.id,
    })

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
            if (!paymentFederation?.id) throw new Error()

            const gateways = await dispatch(
                listGateways({ fedimint, federationId: paymentFederation.id }),
            ).unwrap()

            if (!gateways.length) {
                throw new Error('No available lightning gateways')
            }

            const msats = amountUtils.satToMsat(inputAmount)
            const paymentRequest = lnurlWithdrawal
                ? await lnurlWithdraw(
                      fedimint,
                      paymentFederation.id,
                      lnurlWithdrawal,
                      msats,
                      memo,
                  ).match(
                      ok => ok,
                      e => {
                          // TODO: do not throw
                          throw e
                      },
                  )
                : await dispatch(
                      generateInvoice({
                          fedimint,
                          federationId: paymentFederation.id,
                          amount: msats,
                          description: memo,
                          frontendMetadata: {
                              initialNotes: null,
                              recipientMatrixId: null,
                              senderMatrixId: null,
                          },
                      }),
                  ).unwrap()
            onAcceptRef.current({ paymentRequest })
        } catch (err) {
            log.error('Failed to generate invoice', err, lnurlWithdrawal)

            setError(formatErrorMessage(t, err, 'errors.unknown-error'))
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
                          fediMod: siteInfo?.title,
                      })
                    : t('feature.fedimods.enter-amount-to-withdraw', {
                          fediMod: siteInfo?.title,
                      }),
                description: requestInvoiceArgs?.defaultMemo || '',
                body: (
                    <Flex
                        grow
                        align="center"
                        gap="lg"
                        style={{ paddingTop: theme.spacing.xl }}>
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
                                verb={t('words.request')}
                                onChangeAmount={amt => {
                                    setSubmitAttempts(0)
                                    setInputAmount(amt)
                                }}
                                error={error}
                            />
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
                        onPress: handleAccept,
                    },
                ],
            }}
        />
    )
}
