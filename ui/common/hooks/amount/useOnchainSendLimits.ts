import { useEffect, useState } from 'react'

import { selectFederationBalance } from '../../redux'
import { Federation, ParsedBitcoinAddress, Sats } from '../../types'
import amountUtils from '../../utils/AmountUtils'
import { makeLog } from '../../utils/log'
import { useFedimint } from '../fedimint'
import { useCommonSelector } from '../redux'

const log = makeLog('common/hooks/amount/useOnchainSendLimits')

export interface OnchainSendLimits {
    minimumAmount: Sats
    maximumAmount: Sats
}

export function useOnchainSendLimits(
    btcAddress: ParsedBitcoinAddress['data'] | null | undefined,
    federationId?: Federation['id'] | undefined,
) {
    const fedimint = useFedimint()
    const address = btcAddress?.address
    const [limits, setLimits] = useState<OnchainSendLimits | null>(null)
    const balance = useCommonSelector(s =>
        selectFederationBalance(s, federationId || ''),
    )

    useEffect(() => {
        setLimits(null)
        if (!address || !federationId || !fedimint) return

        let isStale = false
        fedimint
            .getPayAddressLimits(address, federationId)
            .then(fetched => {
                if (isStale) return
                setLimits({
                    minimumAmount: amountUtils.msatToSat(fetched.minSpendable),
                    maximumAmount: amountUtils.msatToSat(fetched.maxSpendable),
                })
            })
            .catch(e => log.warn('getPayAddressLimits', e))
        return () => {
            isStale = true
        }
    }, [balance, address, fedimint, federationId])

    return limits
}
