import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useMakeLightningRequest } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { Sats, TransactionListEntry } from '@fedi/common/types'

import { NoteInput, QRContainer } from '.'
import { Dialog } from '.././Dialog'
import { AmountInput } from '../AmountInput'
import { Button } from '../Button'
import { CopyInput } from '../CopyInput'
import { Column } from '../Flex'
import { HorizontalLine } from '../HorizontalLine'
import { QRCode } from '../QRCode'
import LnurlReceive from './LnurlReceive'

export default function LightningRequest({
    onSubmit,
    onInvoicePaid,
    federationId,
    onLnurlClick,
}: {
    onSubmit: () => void
    onInvoicePaid: (txn: TransactionListEntry) => void
    federationId?: string
    onLnurlClick?: () => void
}) {
    const { t } = useTranslation()
    const toast = useToast()
    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        setMemo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({ federationId })
    const { invoice, isInvoiceLoading, makeLightningRequest } =
        useMakeLightningRequest({
            federationId,
            onInvoicePaid,
        })

    const [submitAttempts, setSubmitAttempts] = useState(0)
    const [open, setOpen] = useState(false)

    const handleSubmit = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        try {
            await makeLightningRequest(amount, memo)
            onSubmit()
        } catch (e) {
            toast.error(t, e)
        }
    }

    const onChangeAmount = (amt: Sats) => {
        setAmount(amt)
        setSubmitAttempts(0)
    }

    return (
        <>
            <AmountInput
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                readOnly={Boolean(exactAmount) || Boolean(invoice)}
                verb={t('words.request')}
                extraInput={
                    invoice ? null : (
                        <NoteInput
                            value={memo}
                            placeholder={t('phrases.add-note')}
                            onChange={ev => setMemo(ev.currentTarget.value)}
                        />
                    )
                }
            />
            {invoice ? (
                <QRContainer>
                    <QRCode data={invoice} />
                    <CopyInput
                        value={invoice || ''}
                        onCopyMessage={t('feature.receive.copied-payment-code')}
                    />
                </QRContainer>
            ) : (
                <Column gap="xs">
                    <Button
                        width="full"
                        onClick={handleSubmit}
                        loading={isInvoiceLoading}>
                        {t('feature.receive.request-sats', {
                            amount,
                        })}
                    </Button>
                    {!!onLnurlClick && (
                        <>
                            <HorizontalLine text={t('words.or')} />
                            <Button
                                variant="secondary"
                                onClick={() => setOpen(true)}>
                                {t('phrases.reusable-payment-code')}
                            </Button>
                        </>
                    )}
                </Column>
            )}

            <Dialog title={t('words.lnurl')} open={open} onOpenChange={setOpen}>
                <LnurlReceive
                    onSubmit={handleSubmit}
                    onWithdrawPaid={onInvoicePaid}
                    federationId={federationId || ''}
                />
            </Dialog>
        </>
    )
}
