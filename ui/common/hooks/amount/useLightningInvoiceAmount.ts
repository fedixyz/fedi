import { useEffect, useState } from 'react'

import { Federation, Invoice, MSats } from '../../types'
import { useFedimint } from '../fedimint'

/**
 * Calculates the amount required to pay a lightning invoice
 * Returns null if no lightning address is provided or if fee estimation fails.
 */
export function useLightningInvoiceAmount(
    invoice: Invoice | null | undefined,
    federationId?: Federation['id'] | undefined,
) {
    const fedimint = useFedimint()
    const [exactAmountLightning, setExactAmountLightning] =
        useState<MSats | null>(null)

    useEffect(() => {
        if (!invoice || !federationId || !fedimint) return

        fedimint
            .estimateLnFees(invoice.invoice, federationId)
            .then(fees => {
                const totalFees = (fees.federationFee +
                    fees.networkFee +
                    fees.fediFee) as MSats
                const totalAmount = (invoice.amount + totalFees) as MSats

                setExactAmountLightning(totalAmount)
            })
            .catch(() => setExactAmountLightning(null))
    }, [invoice, fedimint, federationId])

    return exactAmountLightning
}
