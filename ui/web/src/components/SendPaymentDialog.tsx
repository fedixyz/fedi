import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import ChevronRight from '@fedi/common/assets/svgs/chevron-right.svg'
import OfflineIcon from '@fedi/common/assets/svgs/offline.svg'
import { useBalanceDisplay } from '@fedi/common/hooks/amount'
import { useChatMemberSearch } from '@fedi/common/hooks/chat'
import { useIsOfflineWalletSupported } from '@fedi/common/hooks/federation'
import { useOmniPaymentState } from '@fedi/common/hooks/pay'
import {
    selectActiveFederation,
    selectChatConnectionOptions,
    selectChatMembersWithHistory,
} from '@fedi/common/redux'
import { ParserDataType, Sats } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { formatErrorMessage } from '@fedi/common/utils/format'

import { useRouteState } from '../context/RouteStateContext'
import { useAppSelector, useMediaQuery } from '../hooks'
import { fedimint } from '../lib/bridge'
import { config, styled } from '../styles'
import { AmountInput } from './AmountInput'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { DialogStatus, DialogStatusProps } from './DialogStatus'
import { Icon } from './Icon'
import { OmniInput } from './OmniInput'
import { SendOffline } from './SendOffline'
import { Text } from './Text'

const expectedInputTypes = [
    ParserDataType.Bolt11,
    ParserDataType.LnurlPay,
    ParserDataType.FediChatUser,
    ParserDataType.LegacyFediChatMember,
] as const

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
}

export const SendPaymentDialog: React.FC<Props> = ({ open, onOpenChange }) => {
    const { t } = useTranslation()
    const activeFederation = useAppSelector(selectActiveFederation)
    const membersWithHistory = useAppSelector(selectChatMembersWithHistory)
    const balance = activeFederation?.hasWallet
        ? activeFederation.balance
        : undefined
    const activeFederationId = activeFederation?.id
    const sendRouteState = useRouteState('/send')
    const connectionOptions = useAppSelector(selectChatConnectionOptions)
    const {
        isReadyToPay,
        exactAmount,
        minimumAmount,
        maximumAmount,
        description,
        inputAmount,
        setInputAmount,
        handleOmniInput,
        handleOmniSend,
        resetOmniPaymentState,
    } = useOmniPaymentState(fedimint, activeFederationId, false, t)
    const { setQuery, searchedMembers } =
        useChatMemberSearch(membersWithHistory)

    const [isSendingOffline, setIsSendingOffline] = useState(false)
    const [isCloseDisabled, setIsCloseDisabled] = useState(false)
    const [isSending, setIsSending] = useState(false)
    const [hasSent, setHasSent] = useState(false)
    const [sendError, setSendError] = useState<string>()
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [value, setValue] = useState('')

    const containerRef = useRef<HTMLDivElement | null>(null)
    const isOfflineWalletSupported = useIsOfflineWalletSupported()
    const isSmall = useMediaQuery(config.media.sm)
    const balanceDisplay = useBalanceDisplay(t)

    const enteringLnAddress = value.includes('@')
    const enteringLnInvoice =
        value.startsWith('lntbs') || value.startsWith('lnbc')

    const lnAddressValid =
        enteringLnAddress && z.string().email().safeParse(value).success
    const lnInvoiceValid = useMemo(async () => {
        try {
            if (!enteringLnInvoice || !activeFederation?.id) return false

            await fedimint.decodeInvoice(value, activeFederation.id)

            return true
        } catch {
            return false
        }
    }, [value, enteringLnInvoice, activeFederation?.id])

    // Reset modal on close and open
    useEffect(() => {
        if (!open) {
            setIsSendingOffline(false)
            setIsCloseDisabled(false)
            setIsSending(false)
            setHasSent(false)
            setSendError(undefined)
            setQuery('')
            setValue('')
            setSubmitAttempts(0)
            resetOmniPaymentState()
        } else {
            requestAnimationFrame(() =>
                containerRef.current?.querySelector('input')?.focus(),
            )
        }
    }, [open, resetOmniPaymentState, setQuery])

    // If we were sent here with route state, feed it to the omni input
    useEffect(() => {
        if (!open || !sendRouteState) return
        handleOmniInput(sendRouteState)
    }, [open, sendRouteState, handleOmniInput])

    useEffect(() => {
        if (
            value &&
            value.length > 0 &&
            !enteringLnAddress &&
            !enteringLnInvoice
        ) {
            setQuery(value)
        } else {
            setQuery('')
        }
    }, [value, setQuery, enteringLnInvoice, enteringLnAddress])

    const handleChangeAmount = useCallback(
        (amount: Sats) => {
            setSubmitAttempts(0)
            setInputAmount(amount)
        },
        [setInputAmount],
    )

    const handleSend = useCallback(async () => {
        setSubmitAttempts(attempts => attempts + 1)
        setIsSending(true)
        try {
            await handleOmniSend(inputAmount)
            setHasSent(true)
            setTimeout(() => onOpenChange(false), 2500)
        } catch (err) {
            setSendError(formatErrorMessage(t, err, 'errors.unknown-error'))
        }
        setIsSending(false)
    }, [handleOmniSend, inputAmount, onOpenChange, t])

    if (typeof balance !== 'number') return null

    let content: React.ReactNode
    let dialogStatusProps: DialogStatusProps | undefined
    if (isReadyToPay) {
        const satsFmt = inputAmount ? amountUtils.formatSats(inputAmount) : ''
        content = (
            <>
                <InvoiceContainer>
                    <AmountInput
                        amount={inputAmount}
                        onChangeAmount={handleChangeAmount}
                        readOnly={!!exactAmount}
                        verb={t('words.send')}
                        minimumAmount={minimumAmount}
                        maximumAmount={maximumAmount}
                        submitAttempts={submitAttempts}
                        autoFocus={!isSmall}
                        extraInput={
                            description ? (
                                <InvoiceDescription>
                                    <Text variant="caption" weight="medium">
                                        &quot;{description}&quot;
                                    </Text>
                                </InvoiceDescription>
                            ) : undefined
                        }
                    />
                </InvoiceContainer>
                <Button onClick={handleSend}>
                    {t('feature.send.send-amount-unit', {
                        amount: satsFmt,
                        unit: t('words.sats'),
                    })}
                </Button>
            </>
        )

        if (hasSent) {
            dialogStatusProps = {
                status: 'success',
                title: t('feature.send.you-sent-amount-unit', {
                    amount: satsFmt,
                    unit: t('words.sats'),
                }),
            }
        } else if (sendError) {
            dialogStatusProps = {
                status: 'error',
                title: 'Failed to send!', // TODO: Translate
                description: sendError,
            }
        } else if (isSending) {
            dialogStatusProps = {
                status: 'loading',
                description:
                    t('feature.send.you-are-sending-amount-unit', {
                        amount: satsFmt,
                        unit: t('words.sats'),
                    }) + '...',
            }
        }
    } else if (isSendingOffline) {
        content = (
            <SendOffline
                onEcashGenerated={() => setIsCloseDisabled(true)}
                onPaymentSent={() => onOpenChange(false)}
            />
        )
    } else {
        content = (
            <OmniInputContainer>
                <OmniInput
                    inputLabel={t('feature.omni.action-enter-text')}
                    inputPlaceholder="..."
                    expectedInputTypes={expectedInputTypes}
                    onExpectedInput={handleOmniInput}
                    onUnexpectedSuccess={() => onOpenChange(false)}
                    customActions={
                        isOfflineWalletSupported
                            ? [
                                  {
                                      label: t('feature.send.send-offline'),
                                      icon: OfflineIcon,
                                      onClick: () => setIsSendingOffline(true),
                                  },
                              ]
                            : undefined
                    }
                    value={value}
                    onValueChange={setValue}
                    hideConfirmButton>
                    {({ onSubmit }) =>
                        (enteringLnAddress && !lnAddressValid) ||
                        value.length === 0 ? null : enteringLnInvoice ? (
                            <Button
                                onClick={() => onSubmit(value)}
                                disabled={!lnInvoiceValid}
                                width="full">
                                {t('feature.send.confirm-send')}
                            </Button>
                        ) : (
                            <MemberContainer>
                                {lnAddressValid ? (
                                    <MemberItem onClick={() => onSubmit(value)}>
                                        <Avatar
                                            id={value}
                                            name={value.split('@')[0]}
                                        />
                                        <MemberName weight="bold">
                                            {value}
                                        </MemberName>
                                        <Icon size="sm" icon={ChevronRight} />
                                    </MemberItem>
                                ) : searchedMembers.length === 0 ? (
                                    <MemberItem onClick={() => onSubmit(value)}>
                                        <Avatar
                                            id={`${value}@${connectionOptions?.domain}`}
                                            name={value}
                                        />
                                        <MemberName weight="bold">
                                            {value}
                                        </MemberName>
                                        <Icon size="sm" icon={ChevronRight} />
                                    </MemberItem>
                                ) : (
                                    searchedMembers.map(member => (
                                        <MemberItem
                                            key={member.id}
                                            onClick={() =>
                                                onSubmit(member.username)
                                            }>
                                            <Avatar
                                                id={member.id}
                                                name={member.username}
                                            />
                                            <MemberName weight="bold">
                                                {member.username}
                                            </MemberName>
                                            <Icon
                                                size="sm"
                                                icon={ChevronRight}
                                            />
                                        </MemberItem>
                                    ))
                                )}
                            </MemberContainer>
                        )
                    }
                </OmniInput>
            </OmniInputContainer>
        )
    }

    return (
        <Dialog
            title={t(
                isSendingOffline
                    ? 'feature.send.send-bitcoin-offline'
                    : 'feature.send.send-bitcoin',
            )}
            description={balanceDisplay}
            open={open}
            disableClose={isCloseDisabled}
            mobileDismiss="back"
            onOpenChange={onOpenChange}>
            <Container ref={containerRef}>
                {content}
                {dialogStatusProps && <DialogStatus {...dialogStatusProps} />}
            </Container>
        </Dialog>
    )
}

const OmniInputContainer = styled('div', {
    display: 'flex',
})

const Container = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})

const InvoiceContainer = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    padding: '32px 0',
})

const InvoiceDescription = styled('div', {
    textAlign: 'center',
    marginBottom: 24,
})

const MemberContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: '100%',
})

const MemberItem = styled('button', {
    display: 'flex',
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    alignItems: 'center',
    textAlign: 'left',
})

const MemberName = styled(Text, {
    flex: 1,
})
