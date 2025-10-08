import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useRequestForm } from '@fedi/common/hooks/amount'
import { useLnurlWithdraw } from '@fedi/common/hooks/receive'
import { useToast } from '@fedi/common/hooks/toast'
import { selectPaymentFederation } from '@fedi/common/redux'
import {
    ParsedLnurlWithdraw,
    Sats,
    TransactionListEntry,
} from '@fedi/common/types'
import amountUtils from '@fedi/common/utils/AmountUtils'

import { NoteInput } from '.'
import { useAppSelector } from '../../hooks'
import { fedimint } from '../../lib/bridge'
import { AmountInput } from '../AmountInput'
import { Button } from '../Button'
import { FederationWalletSelector } from '../FederationWalletSelector'

export default function LnurlWithdraw({
    lnurlw,
    onSubmit,
    onWithdrawPaid,
}: {
    lnurlw: ParsedLnurlWithdraw | undefined
    onSubmit: () => void
    onWithdrawPaid: (txn: TransactionListEntry) => void
}) {
    const [submitAttempts, setSubmitAttempts] = useState(0)

    const toast = useToast()

    const paymentFederation = useAppSelector(selectPaymentFederation)
    const federationId = paymentFederation?.id

    const {
        inputAmount: amount,
        setInputAmount: setAmount,
        exactAmount,
        memo,
        setMemo,
        minimumAmount,
        maximumAmount,
    } = useRequestForm({ federationId, lnurlWithdrawal: lnurlw?.data })
    const { t } = useTranslation()
    const { isWithdrawing, handleWithdraw } = useLnurlWithdraw({
        federationId,
        fedimint,
        lnurlw,
        onWithdrawPaid,
    })

    const handleSubmit = async () => {
        setSubmitAttempts(attempts => attempts + 1)
        if (amount > maximumAmount || amount < minimumAmount) {
            return
        }

        try {
            await handleWithdraw(amount, memo)
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
            <FederationWalletSelector />
            <AmountInput
                amount={amount}
                onChangeAmount={onChangeAmount}
                minimumAmount={minimumAmount}
                maximumAmount={maximumAmount}
                submitAttempts={submitAttempts}
                readOnly={Boolean(exactAmount)}
                verb={t('words.redeem')}
                extraInput={
                    <NoteInput
                        value={memo}
                        placeholder={t('phrases.add-note')}
                        onChange={ev => setMemo(ev.currentTarget.value)}
                    />
                }
            />
            <Button width="full" onClick={handleSubmit} loading={isWithdrawing}>
                {`${t('words.redeem')}${
                    amount ? ` ${amountUtils.formatSats(amount)} ` : ' '
                }${t('words.sats').toUpperCase()}`}
            </Button>
        </>
    )
}
