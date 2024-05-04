import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
    useBalanceDisplay,
    useMinMaxRequestAmount,
    useMinMaxSendAmount,
} from '@fedi/common/hooks/amount'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    selectActiveFederation,
    sendDirectMessage,
    selectAuthenticatedMember,
} from '@fedi/common/redux'
import { ChatPaymentStatus, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'
import { AmountInput } from './AmountInput'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface Props {
    recipientId: string
    open: boolean
    onOpenChange(open: boolean): void
}

export const ChatPaymentDialog: React.FC<Props> = ({
    open,
    recipientId,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const toast = useToast()
    const activeFederation = useAppSelector(selectActiveFederation)
    const myId = useAppSelector(selectAuthenticatedMember)?.id
    const sendMinMax = useMinMaxSendAmount()
    const requestMinMax = useMinMaxRequestAmount({ ecashRequest: {} })
    const [amount, setAmount] = useState(0 as Sats)
    const [submitAction, setSubmitAction] = useState<null | 'send' | 'request'>(
        null,
    )
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [submitType, setSubmitType] = useState<'send' | 'request'>()
    const onOpenChangeRef = useUpdatingRef(onOpenChange)
    const balanceDisplay = useBalanceDisplay(t)

    const federationId = activeFederation?.id

    useEffect(() => {
        if (open) return
        setAmount(0 as Sats)
        setSubmitAction(null)
        setSubmitAttempts(0)
        setSubmitType(undefined)
    }, [open])

    const sendPaymentMessage = useCallback(
        async (token?: string) => {
            if (!federationId || !myId) return
            try {
                await dispatch(
                    sendDirectMessage({
                        fedimint,
                        federationId,
                        recipientId,
                        payment: {
                            status: token
                                ? ChatPaymentStatus.accepted
                                : ChatPaymentStatus.requested,
                            amount: amountUtils.satToMsat(amount),
                            recipient: token ? recipientId : myId,
                            token,
                        },
                    }),
                ).unwrap()
                onOpenChangeRef.current(false)
            } catch (err) {
                toast.error(t, err, 'errors.chat-unavailable')
            }
        },
        [
            dispatch,
            federationId,
            recipientId,
            myId,
            amount,
            toast,
            onOpenChangeRef,
            t,
        ],
    )

    const handleSend = useCallback(async () => {
        if (!federationId) return
        setSubmitType('send')
        setSubmitAttempts(attempt => attempt + 1)
        if (
            amount < sendMinMax.minimumAmount ||
            amount > sendMinMax.maximumAmount
        ) {
            return
        }

        setSubmitAction('send')
        try {
            const token = await fedimint.generateEcash(
                amountUtils.satToMsat(amount),
                federationId,
            )
            await sendPaymentMessage(token.ecash)
        } catch (err) {
            toast.error(t, err, 'errors.unknown-error')
        }
        setSubmitAction(null)
    }, [sendPaymentMessage, amount, sendMinMax, toast, federationId, t])

    const handleRequest = useCallback(async () => {
        setSubmitType('request')
        setSubmitAttempts(attempt => attempt + 1)
        if (
            amount < requestMinMax.minimumAmount ||
            amount > requestMinMax.maximumAmount
        ) {
            return
        }

        setSubmitAction('request')
        setSubmitType('request')
        await sendPaymentMessage()
        setSubmitAction(null)
    }, [sendPaymentMessage, amount, requestMinMax])

    const inputMinMax =
        submitType === 'send'
            ? sendMinMax
            : submitType === 'request'
            ? requestMinMax
            : {}

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <Balance>{balanceDisplay}</Balance>
            <AmountContainer>
                {open && (
                    <AmountInput
                        amount={amount}
                        onChangeAmount={setAmount}
                        verb={
                            submitType === 'send'
                                ? t('words.send')
                                : t('words.request')
                        }
                        submitAttempts={submitAttempts}
                        {...inputMinMax}
                    />
                )}
            </AmountContainer>
            <Actions>
                <Button
                    loading={submitAction === 'request'}
                    disabled={submitAction === 'send'}
                    onClick={handleRequest}>
                    {t('words.request')}
                </Button>
                <Button
                    loading={submitAction === 'send'}
                    disabled={submitAction === 'request'}
                    onClick={handleSend}>
                    {t('words.send')}
                </Button>
            </Actions>
        </Dialog>
    )
}

const Balance = styled('div', {
    fontSize: theme.fontSizes.caption,
    textAlign: 'center',
    color: theme.colors.darkGrey,
})

const AmountContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: `60px 0`,

    '@sm': {
        padding: '32px 0',
    },
})

const Actions = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,

    '> *': {
        flex: 1,
    },
})
