import { useState } from 'react'

import { selectWithdrawableStableBalanceCents } from '../../redux'
import { Federation, Sats, UsdCents } from '../../types'
import { useCommonSelector } from '../redux'
import { useBtcFiatPrice } from './useBtcFiatPrice'
import { useMinMaxWithdrawAmount } from './useMinMaxWithdrawAmount'

/**
 * Provide all the state necessary to implement a stabilitypool withdrawal form
 * that decreases the stable USD balance in the wallet
 */
export function useWithdrawForm(federationId: Federation['id']) {
    const [inputAmount, setInputAmount] = useState<Sats>(0 as Sats)
    const [inputFiatAmount, setInputFiatAmount] = useState<UsdCents>(
        0 as UsdCents,
    )
    const { minimumAmount, maximumAmount } =
        useMinMaxWithdrawAmount(federationId)
    const maximumFiatCents = useCommonSelector(s =>
        selectWithdrawableStableBalanceCents(s, federationId),
    )

    const { convertCentsToFormattedFiat, convertSatsToCents } =
        useBtcFiatPrice()

    const maximumFiatAmount = convertCentsToFormattedFiat(maximumFiatCents)
    const inputAmountCents = convertSatsToCents(inputAmount)

    return {
        inputAmount,
        inputAmountCents,
        setInputAmount,
        inputFiatAmount,
        setInputFiatAmount,
        minimumAmount,
        maximumAmount,
        maximumFiatAmount,
    }
}
