import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'

import {
    CommonState,
    selectStabilityPoolCycleStartPrice,
    selectFederationMetadata,
} from '.'
import { Federation, SupportedCurrency } from '../types'
import {
    getFederationDefaultCurrency,
    getFederationFixedExchangeRate,
} from '../utils/FederationUtils'
import { makeLog } from '../utils/log'
import { loadFromStorage } from './storage'

const log = makeLog('redux/currency')

/*** Initial State ***/

const initialState = {
    btcUsdRate: 0 as number,
    fiatUsdRates: {} as Record<string, number | undefined>,
    selectedFiatCurrency: null as SupportedCurrency | null,
}

export type CurrencyState = typeof initialState

/*** Slice definition ***/

export const currencySlice = createSlice({
    name: 'currency',
    initialState,
    reducers: {
        changeSelectedFiatCurrency(
            state,
            action: PayloadAction<SupportedCurrency>,
        ) {
            state.selectedFiatCurrency = action.payload
        },
        resetCurrencyState() {
            return { ...initialState }
        },
    },
    extraReducers: builder => {
        builder.addCase(fetchCurrencyPrices.fulfilled, (state, action) => {
            state.btcUsdRate = action.payload.btcUsdRate
            state.fiatUsdRates = {
                ...state.fiatUsdRates,
                ...action.payload.fiatUsdRates,
            }
        })

        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return
            state.selectedFiatCurrency = action.payload.currency
            state.btcUsdRate = action.payload.btcUsdRate
            state.fiatUsdRates = action.payload.fiatUsdRates
        })
    },
})

/*** Basic actions ***/

export const { changeSelectedFiatCurrency, resetCurrencyState } =
    currencySlice.actions

/*** Async thunk actions ***/

export const fetchCurrencyPrices = createAsyncThunk<
    Pick<CurrencyState, 'btcUsdRate' | 'fiatUsdRates'>,
    void
>('currency/fetchCurrencyPrices', async () => {
    const response = await fetch('https://price-feed.dev.fedibtc.com/latest')
    const json: {
        prices: Record<string, { rate: number; timestamp: string }>
    } = await response.json()

    // Ensure we have BTC/USD, if we're missing that then something is very wrong.
    const btcUsdRate = json?.prices['BTC/USD']?.rate
    if (typeof btcUsdRate !== 'number') {
        log.warn(
            'No BTC/USD rate found in price feed, rejecting response',
            json,
        )
        throw new Error('Missing required BTC/USD rate from price feed')
    }

    // Map all other fiats automatically into their own object.
    const fiatUsdRates: CurrencyState['fiatUsdRates'] = {}
    Object.entries(json.prices).forEach(([currency, { rate }]) => {
        const [fiat, usd] = currency.split('/')
        if (usd !== 'USD' || fiat === 'BTC') return
        fiatUsdRates[fiat] = rate
    })

    return { btcUsdRate, fiatUsdRates }
})

/*** Selectors ***/

export const selectCurrency = (s: CommonState) => {
    if (s.currency.selectedFiatCurrency) return s.currency.selectedFiatCurrency

    const metadata = selectFederationMetadata(s)
    if (metadata) {
        const federationDefaultCurrency = getFederationDefaultCurrency(metadata)
        if (federationDefaultCurrency) return federationDefaultCurrency
    }

    return SupportedCurrency.USD
}

export const selectCurrencies = (s: CommonState) => {
    const metadata = selectFederationMetadata(s)
    const defaultCurrency =
        getFederationDefaultCurrency(metadata) || SupportedCurrency.USD

    const sortedCurrencies = Object.entries(SupportedCurrency)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .sort(([, a], [, b]) =>
            a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : 0,
        )

    return Object.fromEntries(sortedCurrencies)
}

export const selectBtcUsdExchangeRate = (
    s: CommonState,
    federationId?: Federation['id'],
) => {
    const stabilityPoolPrice = selectStabilityPoolCycleStartPrice(
        s,
        federationId,
    )
    return stabilityPoolPrice || s.currency.btcUsdRate || 0
}

export const selectBtcExchangeRate = (s: CommonState) => {
    const selectedFiatCurrency = selectCurrency(s)
    const metadata = selectFederationMetadata(s)
    const btcUsdRate = selectBtcUsdExchangeRate(s)

    let fiatUsdRate = s.currency.fiatUsdRates[selectedFiatCurrency] || 0

    // Special case for Togo farmers using CFA, where a metadata override
    // provides the exchange rate directly if the default_currency
    // is selected
    // TODO: Remove me? Do we want to keep supporting this feature?
    if (metadata) {
        const defaultCurrency = getFederationDefaultCurrency(metadata)
        if (defaultCurrency && defaultCurrency === selectedFiatCurrency) {
            const federationFixedExchangeRate =
                getFederationFixedExchangeRate(metadata)
            if (federationFixedExchangeRate) {
                return federationFixedExchangeRate
            }
        }
    }

    // Special case for the CFA franc which is a fixed rate to the dollar
    // TODO: Remove me when CFA is added to price oracle.
    if (selectedFiatCurrency === SupportedCurrency.CFA && !fiatUsdRate) {
        fiatUsdRate = 0.0016
    }

    return selectedFiatCurrency === SupportedCurrency.USD
        ? btcUsdRate
        : btcUsdRate / fiatUsdRate
}
