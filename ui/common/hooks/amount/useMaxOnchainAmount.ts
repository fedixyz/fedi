import { useEffect, useState } from 'react'

import { selectFederationBalance } from '../../redux'
import { Federation, ParsedBitcoinAddress, Sats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { BridgeError } from '../../utils/errors'
import { useFedimint } from '../fedimint'
import { useCommonSelector } from '../redux'

/**
 * Calculate the maximum amount that can be sent onchain accounting for network fees.
 * Returns null if no btcAddress is provided or if calculation is not applicable.
 */
export function useMaxOnchainAmount(
    btcAddress: ParsedBitcoinAddress['data'] | null | undefined,
    federationId?: Federation['id'] | undefined,
) {
    const fedimint = useFedimint()
    const [maxAmountOnchain, setMaxAmountOnchain] = useState<Sats | null>(null)
    const balance = useCommonSelector(s =>
        selectFederationBalance(s, federationId || ''),
    )

    useEffect(() => {
        if (!btcAddress || !federationId || !fedimint) return

        // Attempts to preview the payment address with the full user balance
        // Should always result in an insufficient balance error
        // TODO: refactor to use a new bridge RPC calculateMaxOnchainAmount
        // instead of having to force the error
        fedimint
            .previewPayAddress(
                btcAddress.address,
                amountUtils.msatToSat(balance),
                federationId,
            )
            .catch(e => {
                if (
                    e instanceof BridgeError &&
                    e.errorCode &&
                    typeof e.errorCode === 'object' &&
                    'insufficientBalance' in e.errorCode &&
                    typeof e.errorCode.insufficientBalance === 'number'
                ) {
                    setMaxAmountOnchain(
                        amountUtils.msatToSat(e.errorCode.insufficientBalance),
                    )
                }
            })
    }, [balance, btcAddress, fedimint, federationId])

    return maxAmountOnchain
}
