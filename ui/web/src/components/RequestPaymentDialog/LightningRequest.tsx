import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useMakeLightningRequest } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { Sats, TransactionListEntry } from '@fedi/common/types'

import { NoteInput, QRContainer } from '.'
import { AmountInput } from '../AmountInput'
import { Button } from '../Button'
import { CopyInput } from '../CopyInput'
import { QRCode } from '../QRCode'

export default function LightningRequest({
    onSubmit,
    onInvoicePaid,
    federationId,
}: {
    onSubmit: () => void
    onInvoicePaid: (txn: TransactionListEntry) => void
    federationId?: string
}) {
    const [submitAttempts, setSubmitAttempts] = useState(0)

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
    const { t } = useTranslation()
    const { invoice, isInvoiceLoading, makeLightningRequest } =
        useMakeLightningRequest({
            federationId,
            onInvoicePaid,
        })

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
                <Button
                    width="full"
                    onClick={handleSubmit}
                    loading={isInvoiceLoading}>
                    {t('feature.receive.request-sats', {
                        amount,
                    })}
                </Button>
            )}
        </>
    )
}
