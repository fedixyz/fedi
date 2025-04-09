import { ThunkDispatch } from '@reduxjs/toolkit'
import { AnyAction } from 'redux'

import { CommonState } from '../redux'
import { FedimintBridge } from '../utils/fedimint'

/**
 * Parameters for updating historical currency rates.
 */
export type UpdateHistoricalCurrencyRates = {
    fedimint: FedimintBridge
    btcUsdRate: number
    fiatUsdRates: Record<string, number | undefined>
    selectedCurrency: string
    dispatch: ThunkDispatch<CommonState, unknown, AnyAction>
}
