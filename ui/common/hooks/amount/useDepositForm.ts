import { useState } from 'react'

import { Federation, Sats } from '../../types'
import { useMinMaxDepositAmount } from '../amount'
import { useBtcFiatPrice } from './useBtcFiatPrice'

/**
 * Provide all the state necessary to implement a stabilitypool deposit form
 * that increases the stable USD balance in the wallet
 */
export function useDepositForm(federationId: Federation['id']) {
    const { convertSatsToFormattedFiat } = useBtcFiatPrice()
    const [inputAmount, setInputAmount] = useState(0 as Sats)
    const { minimumAmount, maximumAmount } =
        useMinMaxDepositAmount(federationId)
    const maximumFiatAmount = convertSatsToFormattedFiat(maximumAmount)

    return {
        inputAmount,
        setInputAmount,
        minimumAmount,
        maximumAmount,
        maximumFiatAmount,
    }
}
