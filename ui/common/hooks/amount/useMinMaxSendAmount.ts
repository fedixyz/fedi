import { useMemo } from 'react'

import { selectFederationBalance, selectPaymentFederation } from '../../redux'
import { Federation, MSats, Sats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useCommonSelector } from '../redux'
import { useLightningInvoiceAmount } from './useLightningInvoiceAmount'
import { useMaxEcashAmount } from './useMaxEcashAmount'
import { useMaxOnchainAmount } from './useMaxOnchainAmount'
import { SendAmountArgs } from './useSendForm'

/**
 * Get the minimum and maximum amount you can send. Provide optional parameters
 * based on what type of payment is being made since fees may affect min/max amounts
 * (onchain network fees, cashu melting, generating ecash, etc)
 */
export function useMinMaxSendAmount({
    invoice,
    lnurlPayment,
    cashuMeltSummary,
    btcAddress,
    ecashRequest,
    federationId,
}: SendAmountArgs & {
    // TODO: Remove this option in favor of always using payFromFederation once
    // https://github.com/fedibtc/fedi/issues/4070 is finished
    federationId?: Federation['id']
} = {}) {
    const paymentFederation = useCommonSelector(selectPaymentFederation)
    const federationIdToUse = federationId || paymentFederation?.id || ''
    const balance = useCommonSelector(s =>
        selectFederationBalance(s, federationIdToUse),
    )

    const maxAmountOnchain = useMaxOnchainAmount(btcAddress, federationIdToUse)
    const maxAmountEcash = useMaxEcashAmount(ecashRequest, federationIdToUse)
    const exactAmountLightning = useLightningInvoiceAmount(
        invoice,
        federationIdToUse,
    )

    let minSendable: MSats | undefined
    let maxSendable: MSats | undefined

    if (lnurlPayment) {
        minSendable = lnurlPayment.minSendable
        maxSendable = lnurlPayment.maxSendable
    }

    if (exactAmountLightning) {
        minSendable = exactAmountLightning
        maxSendable = exactAmountLightning
    }

    return useMemo(() => {
        if (balance < 1000)
            return {
                // If balance is less than 1000 msat, set the minimum to invoiceAmount, if not undefined
                // Otherwise, set minimum to 1 sat
                minimumAmount: invoice?.amount
                    ? amountUtils.msatToSat(invoice?.amount)
                    : (1 as Sats),
                maximumAmount: 0 as Sats,
            }

        let minimumAmount = 1 as Sats // Cannot send millisat amounts
        let maximumAmount = amountUtils.msatToSat(balance)

        if (cashuMeltSummary) {
            minimumAmount = amountUtils.msatToSat(cashuMeltSummary.totalAmount)
        } else {
            if (minSendable) {
                minimumAmount = amountUtils.msatToSat(minSendable)
            }

            if (maxSendable) {
                maximumAmount = Math.min(
                    amountUtils.msatToSat(maxSendable),
                    maximumAmount || Infinity,
                ) as Sats
            }

            if (btcAddress && maxAmountOnchain !== null) {
                maximumAmount = Math.min(
                    maximumAmount,
                    maxAmountOnchain,
                ) as Sats
            }

            if (ecashRequest && maxAmountEcash !== null) {
                maximumAmount = Math.min(maximumAmount, maxAmountEcash) as Sats
            }
        }
        return { minimumAmount, maximumAmount }
    }, [
        balance,
        cashuMeltSummary,
        invoice,
        minSendable,
        maxSendable,
        maxAmountOnchain,
        maxAmountEcash,
        btcAddress,
        ecashRequest,
    ])
}
