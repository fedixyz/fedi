import { useMemo } from 'react'

import { selectMaxInvoiceAmount } from '../../redux'
import { Federation, Sats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'
import { RequestAmountArgs } from './useRequestForm'

/**
 * Get the minimum and maximum amount you can receive. Optionally take in an
 * LNURL withdrawal, WebLN invoice request, or ecash request as part of the calculation.
 */
export function useMinMaxRequestAmount({
    lnurlWithdrawal,
    requestInvoiceArgs,
    ecashRequest,
    federationId,
}: RequestAmountArgs & { federationId?: Federation['id'] } = {}) {
    const maxInvoiceAmount = useCommonSelector(s =>
        selectMaxInvoiceAmount(s, federationId || ''),
    )

    return useMemo(() => {
        let minimumAmount = 1 as Sats
        let maximumAmount = maxInvoiceAmount
        if (lnurlWithdrawal) {
            if (lnurlWithdrawal.minWithdrawable) {
                minimumAmount = Math.max(
                    amountUtils.msatToSat(lnurlWithdrawal.minWithdrawable),
                    minimumAmount,
                ) as Sats
            }
            if (lnurlWithdrawal.maxWithdrawable) {
                maximumAmount = Math.min(
                    amountUtils.msatToSat(lnurlWithdrawal.maxWithdrawable),
                    maximumAmount,
                ) as Sats
            }
        }
        if (requestInvoiceArgs) {
            if (requestInvoiceArgs.minimumAmount) {
                minimumAmount = Math.max(
                    parseInt(requestInvoiceArgs.minimumAmount as string, 10),
                    minimumAmount,
                ) as Sats
            }
            if (requestInvoiceArgs.maximumAmount) {
                maximumAmount = Math.min(
                    parseInt(requestInvoiceArgs.maximumAmount as string, 10),
                    maximumAmount,
                ) as Sats
            }
        }
        if (ecashRequest) {
            maximumAmount = 1_000_000_000_000_000 as Sats // MAX_SAFE_INTEGER rounded down
            if (ecashRequest.minimumAmount) {
                minimumAmount = Math.max(
                    parseInt(ecashRequest.minimumAmount as string, 10),
                    minimumAmount,
                ) as Sats
            }
            if (ecashRequest.maximumAmount) {
                maximumAmount = Math.min(
                    parseInt(ecashRequest.maximumAmount as string, 10),
                    maximumAmount,
                ) as Sats
            }
        }
        return { minimumAmount, maximumAmount }
    }, [maxInvoiceAmount, lnurlWithdrawal, requestInvoiceArgs, ecashRequest])
}
