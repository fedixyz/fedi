import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useBalanceDisplay } from '@fedi/common/hooks/amount'
import { useChatPaymentUtils } from '@fedi/common/hooks/chat'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { selectMatrixUser } from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'

import { useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { styled, theme } from '../styles'
import { AmountInput } from './AmountInput'
import { Button } from './Button'
import { ChatAvatar } from './ChatAvatar'
import { Dialog } from './Dialog'
import { Text } from './Text'

interface Props {
    roomId: string
    recipientId: string
    open: boolean
    onOpenChange(open: boolean): void
}

export const ChatPaymentDialog: React.FC<Props> = ({
    roomId,
    recipientId,
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const onOpenChangeRef = useUpdatingRef(onOpenChange)
    const balanceDisplay = useBalanceDisplay(t)
    const {
        submitType,
        setSubmitType,
        submitAttempts,
        setSubmitAttempts,
        submitAction,
        setSubmitAction,
        amount,
        setAmount,
        inputMinMax,
        canSendAmount,
        handleSendPayment,
        handleRequestPayment,
    } = useChatPaymentUtils(t, fedimint, roomId, recipientId)
    const recipient = useAppSelector(s => selectMatrixUser(s, recipientId))

    useEffect(() => {
        if (open) return
        setAmount(0 as Sats)
        setSubmitAction(null)
        setSubmitAttempts(0)
        setSubmitType(undefined)
    }, [open, setAmount, setSubmitAction, setSubmitAttempts, setSubmitType])

    const handleRequest = useCallback(async () => {
        handleRequestPayment(() => {
            onOpenChangeRef.current(false)
        })
    }, [handleRequestPayment, onOpenChangeRef])

    const handleSend = useCallback(async () => {
        setSubmitType('send')
        setSubmitAttempts(attempts => attempts + 1)
        if (!canSendAmount) return
        handleSendPayment(() => {
            onOpenChangeRef.current(false)
        })
    }, [
        canSendAmount,
        handleSendPayment,
        onOpenChangeRef,
        setSubmitAttempts,
        setSubmitType,
    ])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <MemberContainer>
                {recipient && (
                    <>
                        <ChatAvatar size="sm" user={recipient} />
                        <Text weight="medium">{recipient.displayName}</Text>
                    </>
                )}
            </MemberContainer>
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

const MemberContainer = styled('div', {
    display: 'flex',
    gap: theme.space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.space.xl,
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
