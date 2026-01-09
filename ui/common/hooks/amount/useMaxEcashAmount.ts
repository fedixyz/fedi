import { useEffect, useState } from 'react'

import { EcashRequest, Federation, Sats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { useFedimint } from '../fedimint'

/**
 * Calculate the maximum amount that can be sent as ecash accounting for fees.
 */
export function useMaxEcashAmount(
    // note: we don't need the amount to know the max amount, this is more of a boolean
    // param to make the RPC call or just return null
    ecashRequest: EcashRequest | null | undefined,
    federationId?: Federation['id'] | undefined,
) {
    const fedimint = useFedimint()
    const [maxAmountEcash, setMaxAmountEcash] = useState<Sats | null>(null)

    useEffect(() => {
        if (!ecashRequest || !federationId) {
            setMaxAmountEcash(null)
            return
        }

        fedimint
            .calculateMaxGenerateEcash(federationId)
            .then(max => setMaxAmountEcash(amountUtils.msatToSat(max)))
            .catch(() => setMaxAmountEcash(null))
    }, [ecashRequest, federationId, fedimint])

    return maxAmountEcash
}
