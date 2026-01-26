import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import FediLogoIcon from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    useChatPaymentPush,
    useChatPaymentUtils,
} from '@fedi/common/hooks/chat'
import { useToast } from '@fedi/common/hooks/toast'
import { useFeeDisplayUtils } from '@fedi/common/hooks/transactions'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    selectCurrency,
    selectMatrixRoom,
    selectPaymentFederation,
} from '@fedi/common/redux'
import { Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { useAppSelector } from '../../hooks'
import { styled, theme } from '../../styles'
import { AmountInput } from '../AmountInput'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { FederationWalletSelector } from '../FederationWalletSelector'
import { Column, Row } from '../Flex'
import { Icon } from '../Icon'
import PaymentType from '../PaymentType'
import { Text } from '../Text'
import { ChatAvatar } from './ChatAvatar'

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
    const [isSending, setIsSending] = useState(false)
    const { t } = useTranslation()
    const onOpenChangeRef = useUpdatingRef(onOpenChange)
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
        handleRequestPayment,
        notes,
        setNotes,
    } = useChatPaymentUtils(t, roomId, recipientId)

    const paymentFederation = useAppSelector(selectPaymentFederation)
    const selectedCurrency = useAppSelector(s =>
        selectCurrency(s, paymentFederation?.id),
    )
    const existingRoom = useAppSelector(s => selectMatrixRoom(s, roomId))

    const { makeFormattedAmountsFromSats } = useAmountFormatter({
        currency: selectedCurrency,
        federationId: paymentFederation?.id,
    })
    const { formattedPrimaryAmount, formattedSecondaryAmount } =
        makeFormattedAmountsFromSats(amount)
    const { makeEcashFeeContent } = useFeeDisplayUtils(
        t,
        paymentFederation?.id || '',
    )
    const { formattedTotalFee, formattedTotalAmount } = makeEcashFeeContent(
        amountUtils.satToMsat(amount),
    )
    const { isProcessing, handleSendPayment } = useChatPaymentPush(
        t,
        roomId,
        recipientId,
    )
    const toast = useToast()

    useEffect(() => {
        if (open) return
        setAmount(0 as Sats)
        setSubmitAction(null)
        setSubmitAttempts(0)
        setSubmitType(undefined)
        setNotes('')
    }, [
        open,
        setAmount,
        setSubmitAction,
        setSubmitAttempts,
        setSubmitType,
        setNotes,
    ])

    const handleRequest = useCallback(async () => {
        handleRequestPayment(() => {
            onOpenChangeRef.current(false)
        })
    }, [handleRequestPayment, onOpenChangeRef])

    const handleInitiateSend = useCallback(() => {
        if (!paymentFederation?.id)
            return toast.error(t, 'errors.please-join-a-federation')
        setSubmitType('send')
        setSubmitAttempts(a => a + 1)
        if (!canSendAmount) return
        setIsSending(true)
    }, [
        paymentFederation?.id,
        t,
        toast,
        canSendAmount,
        setSubmitAttempts,
        setSubmitType,
    ])

    const handleSend = useCallback(async () => {
        setSubmitType('send')
        setSubmitAttempts(attempts => attempts + 1)
        if (!canSendAmount) return
        await handleSendPayment(
            amount,
            () => onOpenChangeRef.current(false),
            notes,
        )
        onOpenChangeRef.current(false)
    }, [
        canSendAmount,
        handleSendPayment,
        onOpenChangeRef,
        setSubmitAttempts,
        setSubmitType,
        amount,
        notes,
    ])

    const confirmSendContent = useCallback(() => {
        return (
            <Column grow>
                <ConfirmContainer>
                    <Row gap="xs" center>
                        <Icon icon={FediLogoIcon} size={16} />
                        <Text weight="bold" variant="caption">
                            {t('words.ecash')}
                        </Text>
                    </Row>
                    <Amounts>
                        <Text variant="h2">{formattedPrimaryAmount}</Text>
                        <Text>{formattedSecondaryAmount}</Text>
                    </Amounts>
                    <Column>
                        {existingRoom && (
                            <>
                                <SendItem>
                                    <Text variant="caption" weight="bold">
                                        {t('feature.send.send-to')}
                                    </Text>
                                    <Row align="center" gap="sm">
                                        <ChatAvatar
                                            user={{
                                                ...existingRoom,
                                                displayName:
                                                    existingRoom.name ?? '',
                                                avatarUrl:
                                                    existingRoom.avatarUrl ??
                                                    undefined,
                                            }}
                                            size="xs"
                                        />
                                        <Text variant="caption" weight="medium">
                                            {existingRoom.name}
                                        </Text>
                                    </Row>
                                </SendItem>
                                <Divider />
                            </>
                        )}
                        <SendItem>
                            <Text variant="caption" weight="bold">
                                {t('words.federation')}
                            </Text>
                            <Text variant="caption" weight="medium">
                                {paymentFederation?.name}
                            </Text>
                        </SendItem>
                        <Divider />
                        <SendGroup>
                            <Row align="center" justify="between">
                                <Text variant="caption">
                                    {t('words.amount')}
                                </Text>
                                <Text variant="caption" weight="medium">
                                    {formattedPrimaryAmount}
                                </Text>
                            </Row>
                            <Row align="center" justify="between">
                                <Text variant="caption">{t('words.fees')}</Text>
                                <Row align="center" gap="xs">
                                    <Text weight="medium" variant="caption">
                                        {formattedTotalFee}
                                    </Text>
                                </Row>
                            </Row>
                            <Row align="center" justify="between">
                                <Text variant="caption" weight="bold">
                                    {t('words.total')}
                                </Text>
                                <Text variant="caption" weight="bold">
                                    {formattedTotalAmount}
                                </Text>
                            </Row>
                        </SendGroup>
                    </Column>
                </ConfirmContainer>
                <Button onClick={handleSend} disabled={isProcessing}>
                    {t('words.send')}
                </Button>
            </Column>
        )
    }, [
        formattedPrimaryAmount,
        formattedSecondaryAmount,
        t,
        formattedTotalAmount,
        formattedTotalFee,
        paymentFederation,
        handleSend,
        isProcessing,
        existingRoom,
    ])

    const inputContent = useCallback(() => {
        return (
            <>
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
                            content={<PaymentType type="ecash" />}
                            extraInput={
                                <Column gap="md" fullWidth>
                                    <FederationWalletSelector />
                                    <NoteInput
                                        value={notes}
                                        placeholder={t('phrases.add-note')}
                                        onChange={ev =>
                                            setNotes(ev.currentTarget.value)
                                        }
                                    />
                                </Column>
                            }
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
                    <Button onClick={handleInitiateSend}>
                        {t('words.send')}
                    </Button>
                </Actions>
            </>
        )
    }, [
        handleInitiateSend,
        amount,
        handleRequest,
        inputMinMax,
        notes,
        open,
        setAmount,
        setNotes,
        submitAction,
        submitAttempts,
        submitType,
        t,
    ])

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            title={
                isSending
                    ? t('feature.multispend.confirm-transaction')
                    : t('feature.chat.request-or-send-money')
            }>
            {isSending ? confirmSendContent() : inputContent()}
        </Dialog>
    )
}

const AmountContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: `60px 0`,

    '@sm': {
        padding: '32px 0',
    },
})

const ConfirmContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 60,
    gap: theme.spacing.lg,

    '@sm': {
        paddingTop: 32,
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

const NoteInput = styled('input', {
    width: '100%',
    padding: 8,
    textAlign: 'center',
    fontSize: theme.fontSizes.caption,
    fontWeight: theme.fontWeights.medium,
    background: 'none',
    border: 'none',
    outline: 'none',

    '&[readonly]': {
        cursor: 'default',
    },
})

const Amounts = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
})

const Divider = styled('div', {
    width: '100%',
    height: 1,
    backgroundColor: theme.colors.lightGrey,
})

const SendItem = styled('div', {
    display: 'flex',
    gap: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
})

const SendGroup = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
})
