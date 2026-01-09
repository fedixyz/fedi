import { TFunction } from 'i18next'
import { useCallback, useState } from 'react'

import {
    EcashRequest,
    Federation,
    Invoice,
    ParsedBip21,
    ParsedBitcoinAddress,
    ParsedLnurlPay,
    Sats,
} from '../../types'
import amountUtils from '../../utils/AmountUtils'
import stringUtils from '../../utils/StringUtils'
import { MeltSummary } from '../../utils/cashu'
import { useUpdatingRef } from '../util'
import { useMinMaxSendAmount } from './useMinMaxSendAmount'

export interface SendAmountArgs {
    btcAddress?: ParsedBitcoinAddress['data'] | null
    bip21Payment?: ParsedBip21['data'] | null
    invoice?: Invoice | null
    lnurlPayment?: ParsedLnurlPay['data'] | null
    cashuMeltSummary?: MeltSummary | null
    ecashRequest?: EcashRequest | null
    t?: TFunction
}

/**
 * Provide all the state necessary to implement a pay form that generates
 * a Lightning invoice. Optionally provide an LNURL pay request.
 */
export function useSendForm({
    btcAddress,
    bip21Payment,
    invoice,
    lnurlPayment,
    cashuMeltSummary,
    t,
    federationId,
}: SendAmountArgs & {
    federationId?: Federation['id']
}) {
    const [inputAmount, setInputAmount] = useState<Sats>(0 as Sats)
    if (!t) throw new Error('useSendForm requires a t function')
    const { minimumAmount, maximumAmount } = useMinMaxSendAmount({
        invoice,
        lnurlPayment,
        btcAddress,
        cashuMeltSummary,
        t,
        federationId,
    })
    const minimumAmountRef = useUpdatingRef(minimumAmount)

    // Determine if they should be able to change the amount, or if an exact
    // amount is requested.
    let exactAmount: Sats | undefined = undefined
    let description: string | undefined
    let sendTo: string | undefined
    if (invoice) {
        exactAmount = amountUtils.msatToSat(invoice.amount)
        description = invoice.description
        sendTo = stringUtils.truncateMiddleOfString(invoice.invoice, 8)
    } else if (
        lnurlPayment &&
        lnurlPayment.minSendable &&
        lnurlPayment.minSendable === lnurlPayment.maxSendable
    ) {
        exactAmount = amountUtils.msatToSat(lnurlPayment.minSendable)
        description = lnurlPayment.description
    } else if (bip21Payment && bip21Payment.amount) {
        exactAmount = amountUtils.btcToSat(bip21Payment.amount)
        description = bip21Payment.message
        sendTo = stringUtils.truncateMiddleOfString(bip21Payment.address, 8)
    } else if (btcAddress) {
        sendTo = stringUtils.truncateMiddleOfString(btcAddress.address, 8)
    } else if (cashuMeltSummary) {
        exactAmount = amountUtils.msatToSat(cashuMeltSummary.totalAmount)
        description = t('feature.omni.confirm-melt-cashu')
        // totalFees = amountUtils.msatToSat(cashuMeltSummary.totalFees)
    }

    const reset = useCallback(() => {
        setInputAmount(minimumAmountRef.current)
    }, [minimumAmountRef])

    return {
        inputAmount,
        setInputAmount,
        description,
        sendTo,
        exactAmount,
        minimumAmount,
        maximumAmount,
        reset,
    }
}
