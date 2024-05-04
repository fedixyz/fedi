import React, { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import CheckIcon from '@fedi/common/assets/svgs/check.svg'
import CloseIcon from '@fedi/common/assets/svgs/close.svg'
import ErrorIcon from '@fedi/common/assets/svgs/error.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import {
    updateChatPayment,
    selectActiveFederationId,
    selectAuthenticatedMember,
    selectChatClientStatus,
} from '@fedi/common/redux'
import {
    ChatMessage as ChatMessageType,
    ChatPayment,
    ChatPaymentStatus,
} from '@fedi/common/types'
import { makePaymentText } from '@fedi/common/utils/chat'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled } from '../styles'
import { Button } from './Button'
import { CircularLoader } from './CircularLoader'
import { Icon } from './Icon'

interface Props {
    message: ChatMessageType
    payment: ChatPayment
}

export const ChatMessagePayment: React.FC<Props> = ({ message, payment }) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const toast = useToast()
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const federationId = useAppSelector(selectActiveFederationId)
    const isChatOnline = useAppSelector(selectChatClientStatus) === 'online'
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const [didReceiveFail, setDidReceiveFail] = useState<boolean>(false)
    const [isLoading, setIsLoading] = useState(false)

    const messageId = message.id
    const paymentStatus = payment.status
    const isSentByMe = message.sentBy === authenticatedMember?.id
    const isSentToMe = message.sentTo === authenticatedMember?.id
    const isPaymentToMe = payment.recipient === authenticatedMember?.id

    const handleDispatchPaymentUpdate = useCallback(
        async (action: Parameters<typeof updateChatPayment>[0]['action']) => {
            if (!federationId) return
            setIsLoading(true)
            try {
                await dispatch(
                    updateChatPayment({
                        fedimint,
                        federationId,
                        messageId,
                        action,
                    }),
                ).unwrap()
            } catch (err) {
                if (action === 'receive') {
                    setDidReceiveFail(true)
                } else {
                    toast.error(t, err, 'errors.chat-payment-failed')
                }
            }
            setIsLoading(false)
        },
        [dispatch, toast, federationId, messageId, t],
    )

    // Attempt to redeem payment right away
    useEffect(() => {
        if (
            !isChatOnline ||
            didReceiveFail ||
            !isPaymentToMe ||
            paymentStatus !== ChatPaymentStatus.accepted
        )
            return
        // Delay attempt to redeem payment by 250ms to allow for payments that
        // have been canceled to come through.
        const timeout = setTimeout(
            () => handleDispatchPaymentUpdate('receive'),
            250,
        )
        return () => clearTimeout(timeout)
    }, [
        isChatOnline,
        didReceiveFail,
        isPaymentToMe,
        paymentStatus,
        handleDispatchPaymentUpdate,
    ])

    const handleCancel = useCallback(() => {
        return handleDispatchPaymentUpdate('cancel')
    }, [handleDispatchPaymentUpdate])

    const handlePay = useCallback(() => {
        return handleDispatchPaymentUpdate('pay')
    }, [handleDispatchPaymentUpdate])

    const handleReject = useCallback(() => {
        return handleDispatchPaymentUpdate('reject')
    }, [handleDispatchPaymentUpdate])

    const messageText = makePaymentText(
        t,
        message,
        authenticatedMember,
        makeFormattedAmountsFromMSats,
    )

    let extra: React.ReactNode = null
    if (payment.status === ChatPaymentStatus.paid) {
        extra = (
            <PaymentResult>
                <Icon size="xs" icon={CheckIcon} />
                <div>{t('words.paid')}</div>
            </PaymentResult>
        )
    } else if (payment.status === ChatPaymentStatus.rejected) {
        extra = (
            <PaymentResult>
                <Icon size="xs" icon={CloseIcon} />
                <div>{t('words.rejected')}</div>
            </PaymentResult>
        )
    } else if (payment.status === ChatPaymentStatus.canceled) {
        extra = (
            <PaymentResult>
                <Icon size="xs" icon={CloseIcon} />
                <div>{t('words.canceled')}</div>
            </PaymentResult>
        )
    } else if (payment.status === ChatPaymentStatus.accepted) {
        if (isPaymentToMe) {
            if (didReceiveFail) {
                extra = (
                    <>
                        <PaymentResult>
                            <Icon size="xs" icon={ErrorIcon} />
                            <div>{t('errors.chat-payment-failed')}</div>
                        </PaymentResult>
                        <PaymentButtons>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDidReceiveFail(false)}>
                                {t('words.retry')}
                            </Button>
                        </PaymentButtons>
                    </>
                )
            } else {
                extra = (
                    <PaymentResult>
                        <CircularLoader size="xs" />
                        <div>{t('words.pending')}...</div>
                    </PaymentResult>
                )
            }
        } else if (isSentByMe) {
            extra = (
                <PaymentButtons>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCancel}
                        loading={isLoading}>
                        {t('words.cancel')}
                    </Button>
                </PaymentButtons>
            )
        } else if (isSentToMe) {
            extra = (
                <PaymentResult>
                    <CircularLoader size="xs" />
                    <div>{t('words.pending')}...</div>
                </PaymentResult>
            )
        }
    } else if (payment.status === ChatPaymentStatus.requested) {
        if (isSentToMe) {
            extra = (
                <PaymentButtons>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleReject}
                        loading={isLoading}>
                        {t('words.reject')}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handlePay}
                        loading={isLoading}>
                        {t('words.pay')}
                    </Button>
                </PaymentButtons>
            )
        } else if (isSentByMe) {
            extra = (
                <PaymentButtons>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCancel}
                        loading={isLoading}>
                        {t('words.cancel')}
                    </Button>
                </PaymentButtons>
            )
        }
    }

    if (!extra) {
        return <>{messageText}</>
    } else {
        return (
            <>
                <div>{messageText}</div>
                {extra}
            </>
        )
    }
}

const PaymentResult = styled('div', {
    display: 'flex',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
})

const PaymentButtons = styled('div', {
    display: 'flex',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,

    '> button': {
        filter: 'drop-shadow(0px 2px 1px rgba(0, 0, 0, 0.15))',
    },
})
