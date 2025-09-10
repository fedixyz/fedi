import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import SwitchLeftIcon from '@fedi/common/assets/svgs/switch-left.svg'
import SwitchRightIcon from '@fedi/common/assets/svgs/switch-right.svg'
import { useRequestForm } from '@fedi/common/hooks/amount'
import { useIsOnchainDepositSupported } from '@fedi/common/hooks/federation'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import { generateInvoice, selectActiveFederationId } from '@fedi/common/redux'
import { Sats, Transaction } from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'
import { lnurlWithdraw } from '@fedi/common/utils/lnurl'

import { useRouteState } from '../context/RouteStateContext'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint } from '../lib/bridge'
import { config, styled, theme } from '../styles'
import { AmountInput } from './AmountInput'
import { Button } from './Button'
import { CopyInput } from './CopyInput'
import { Dialog } from './Dialog'
import { DialogStatus } from './DialogStatus'
import { Icon } from './Icon'
import { QRCode } from './QRCode'
import { ReceiveOffline } from './ReceiveOffline'
import { Text } from './Text'

interface Props {
    open: boolean
    onOpenChange(open: boolean): void
}

export const RequestPaymentDialog: React.FC<Props> = ({
    open,
    onOpenChange,
}) => {
    const { t } = useTranslation()
    const toast = useToast()
    const activeFederationId = useAppSelector(selectActiveFederationId)
    const lnurlw = useRouteState('/request')
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        memo,
        setMemo,
        minimumAmount,
        maximumAmount,
        reset: resetRequestForm,
    } = useRequestForm({
        lnurlWithdrawal: lnurlw?.data,
    })
    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [wantsInvoice, setWantsInvoice] = useState(false)
    const [isLightning, setIsLightning] = useState(true)
    const [lightningInvoice, setLightningInvoice] = useState<string>()
    const [bitcoinUrl, setBitcoinUrl] = useState<string>()
    const [isWithdrawing, setIsWithdrawing] = useState(false)
    const [isReceivingOffline, setIsReceivingOffline] = useState(false)
    const [receivedTransaction, setReceivedTransaction] =
        useState<Transaction>()
    const containerRef = useRef<HTMLDivElement | null>(null)
    const onOpenChangeRef = useUpdatingRef(onOpenChange)
    const isOnchainSupported = useIsOnchainDepositSupported(fedimint)
    const dispatch = useAppDispatch()

    // Reset on close, focus input on desktop open
    useEffect(() => {
        if (!open) {
            resetRequestForm()
            setSubmitAttempts(0)
            setWantsInvoice(false)
            setIsLightning(true)
            setLightningInvoice(undefined)
            setBitcoinUrl(undefined)
            setIsWithdrawing(false)
            setIsReceivingOffline(false)
            setReceivedTransaction(undefined)
        } else {
            if (!window.matchMedia(config.media.sm).matches) {
                requestAnimationFrame(() =>
                    containerRef.current?.querySelector('input')?.focus(),
                )
            }
        }
    }, [open, lnurlw, resetRequestForm])

    // Reset invoices on federation change, amount change
    useEffect(() => {
        setLightningInvoice(undefined)
        setBitcoinUrl(undefined)
    }, [activeFederationId, amount])

    // Generate fresh invoice / address on any change to it
    useEffect(() => {
        if (!wantsInvoice || !activeFederationId) return

        let canceled = false
        let promise: Promise<unknown> | undefined

        if (isLightning && !lightningInvoice) {
            promise = dispatch(
                generateInvoice({
                    fedimint,
                    federationId: activeFederationId,
                    amount: amountUtils.satToMsat(amount),
                    description: memo,
                    frontendMetadata: {
                        initialNotes: memo || null,
                        recipientMatrixId: null,
                        senderMatrixId: null,
                    },
                }),
            )
                .unwrap()
                .then(invoice => {
                    if (canceled) return
                    setLightningInvoice(invoice)
                })
        } else if (!isLightning && !bitcoinUrl) {
            promise = fedimint
                .generateAddress(activeFederationId)
                .then(addr => {
                    if (canceled) return
                    setBitcoinUrl(
                        `bitcoin:${addr}?amount=${amountUtils.satToBtc(
                            amount,
                        )}&message=${memo}`,
                    )
                })
        }

        if (promise) {
            promise.catch(err => {
                toast.error(t, err, 'error.unknown-error')
                setWantsInvoice(false)
            })
            return () => {
                canceled = true
            }
        }
    }, [
        wantsInvoice,
        amount,
        isLightning,
        lightningInvoice,
        bitcoinUrl,
        activeFederationId,
        toast,
        t,
        dispatch,
        memo,
    ])

    // Watch for incoming payments when we're rendering a lightning invoice
    useEffect(() => {
        if (!lightningInvoice) return
        const unsubscribe = fedimint.addListener('transaction', event => {
            const txn = event.transaction

            // check if the txn we got is the same as the one we're waiting for
            const wasLnPayment =
                lightningInvoice &&
                txn.kind === 'lnReceive' &&
                'ln_invoice' in txn &&
                txn.ln_invoice.toLowerCase() === lightningInvoice.toLowerCase()
            const wasBitcoinPayment =
                bitcoinUrl &&
                txn.kind === 'onchainDeposit' &&
                'onchain_address' in txn &&
                bitcoinUrl
                    .toLowerCase()
                    .includes(txn.onchain_address.toLowerCase())

            if (wasLnPayment || wasBitcoinPayment) {
                setIsWithdrawing(false)
                setReceivedTransaction(event.transaction)
                setTimeout(() => {
                    onOpenChangeRef.current(false)
                }, 3000)
            }
        })
        return () => unsubscribe()
    }, [lightningInvoice, bitcoinUrl, onOpenChangeRef])

    const handleLnurlWithdraw = async () => {
        if (!activeFederationId || !lnurlw) return

        setIsWithdrawing(true)
        lnurlWithdraw(
            fedimint,
            activeFederationId,
            lnurlw['data'],
            amountUtils.satToMsat(amount),
            memo,
        )
            .match(setLightningInvoice, e =>
                toast.error(t, e, 'error.unknown-error'),
            )
            .finally(() => setIsWithdrawing(false))
    }

    const handleChangeAmount = useCallback(
        (amt: Sats) => {
            setAmount(amt)
            setSubmitAttempts(0)
        },
        [setAmount],
    )

    const handleSubmit = () => {
        setSubmitAttempts(attempts => attempts + 1)
        // Bail out if invalid amount, let them see error message
        if (amount < minimumAmount || amount > maximumAmount) {
            return
        }
        if (lnurlw) {
            handleLnurlWithdraw()
        } else {
            setWantsInvoice(true)
        }
    }

    const qrData = isLightning ? lightningInvoice?.toUpperCase() : bitcoinUrl
    const copyData = isLightning ? lightningInvoice : bitcoinUrl
    const amountSats = amountUtils.formatSats(amount)

    let content: React.ReactNode
    if (isReceivingOffline) {
        content = <ReceiveOffline onReceive={() => onOpenChange(false)} />
    } else {
        content = (
            <>
                <Center>
                    {isOnchainSupported && !wantsInvoice && (
                        <RequestTypeToggle
                            onClick={() => setIsLightning(!isLightning)}>
                            <Text variant="caption" weight="medium">
                                {t(
                                    isLightning
                                        ? 'words.lightning'
                                        : 'words.onchain',
                                )}
                            </Text>
                            <Icon
                                size={20}
                                icon={
                                    isLightning
                                        ? SwitchLeftIcon
                                        : SwitchRightIcon
                                }
                            />
                        </RequestTypeToggle>
                    )}

                    <AmountInput
                        amount={amount}
                        onChangeAmount={handleChangeAmount}
                        readOnly={wantsInvoice}
                        verb={t('words.request')}
                        minimumAmount={minimumAmount}
                        maximumAmount={maximumAmount}
                        submitAttempts={submitAttempts}
                        extraInput={
                            !wantsInvoice ? (
                                <NoteInput
                                    value={memo}
                                    placeholder={
                                        qrData ? '' : t('phrases.add-note')
                                    }
                                    onChange={ev =>
                                        setMemo(ev.currentTarget.value)
                                    }
                                    readOnly={wantsInvoice}
                                />
                            ) : undefined
                        }
                    />

                    {wantsInvoice && (
                        <QRContainer>
                            <QRCode data={qrData} />
                            <CopyInput
                                value={copyData || ''}
                                onCopyMessage={t(
                                    'feature.receive.copied-payment-code',
                                )}
                            />
                        </QRContainer>
                    )}
                </Center>
                {!wantsInvoice && (
                    <Buttons>
                        <Button
                            width="full"
                            onClick={handleSubmit}
                            loading={isWithdrawing}>
                            {lnurlw
                                ? t('feature.receive.withdraw-from-domain', {
                                      domain: lnurlw.data.domain,
                                  })
                                : t('feature.receive.request-sats', {
                                      amount: amountSats,
                                  })}
                        </Button>
                    </Buttons>
                )}
                {receivedTransaction && (
                    <DialogStatus
                        status="success"
                        title={`${t(
                            receivedTransaction.kind === 'onchainDeposit'
                                ? 'feature.receive.pending-transaction'
                                : 'feature.receive.you-received',
                        )}`}
                        description={`${amountUtils.formatSats(
                            amountUtils.msatToSat(receivedTransaction.amount),
                        )} ${t('words.sats')}`}
                    />
                )}
            </>
        )
    }

    return (
        <Dialog
            title={t('feature.receive.bitcoin-request')}
            open={open}
            mobileDismiss="back"
            onOpenChange={onOpenChange}>
            <Container ref={containerRef}>{content}</Container>
        </Dialog>
    )
}

const Container = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 24,
    gap: 24,
    minHeight: 0,
})

const RequestTypeToggle = styled('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: theme.colors.grey,
    outline: 'none',

    '&:hover, &:focus': {
        color: theme.colors.primary,
    },
})

const Center = styled('div', {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto',
    minHeight: 0,
    gap: 20,
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

const QRContainer = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: 16,
})

const Buttons = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
})
