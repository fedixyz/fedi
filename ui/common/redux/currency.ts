import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'

import {
    CommonState,
    selectFederationMetadata,
    selectLoadedFederations,
    selectStabilityPoolCycleStartPrice,
} from '.'
import { Federation, SelectableCurrency, SupportedCurrency } from '../types'
import {
    getFederationDefaultCurrency,
    getFederationFixedExchangeRate,
} from '../utils/FederationUtils'
import { getCurrencyCode, getSelectableCurrencies } from '../utils/currency'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { loadFromStorage } from './storage'

const log = makeLog('redux/currency')

/*** Initial State ***/

const initialState = {
    btcUsdRate: 0 as number,
    fiatUsdRates: {} as Record<string, number | undefined>,
    overrideCurrency: null as SelectableCurrency | null,
    showFiatTotalBalance: false as boolean,
    currencyLocale: undefined as string | undefined,
    customFederationCurrencies: {} as Record<string, SelectableCurrency>,
}

export type CurrencyState = typeof initialState

/*** Slice definition ***/

export const currencySlice = createSlice({
    name: 'currency',
    initialState,
    reducers: {
        changeOverrideCurrency(
            state,
            action: PayloadAction<SelectableCurrency | null>,
        ) {
            state.overrideCurrency = action.payload
        },
        changeShowFiatTotalBalance(state, action: PayloadAction<boolean>) {
            state.showFiatTotalBalance = action.payload
        },
        setCurrencyLocale(state, action: PayloadAction<string>) {
            state.currencyLocale = action.payload
        },
        resetCurrencyState() {
            return { ...initialState }
        },
        setFederationCurrency(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                currency: SelectableCurrency
            }>,
        ) {
            state.customFederationCurrencies = {
                ...state.customFederationCurrencies,
                [action.payload.federationId]: action.payload.currency,
            }
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
            state.overrideCurrency = action.payload.currency
            state.btcUsdRate = action.payload.btcUsdRate
            state.fiatUsdRates = action.payload.fiatUsdRates
            state.customFederationCurrencies =
                action.payload.customFederationCurrencies
            state.showFiatTotalBalance = action.payload.showFiatTotalBalance
        })
    },
})

/*** Basic actions ***/

export const {
    changeOverrideCurrency,
    changeShowFiatTotalBalance,
    setCurrencyLocale,
    resetCurrencyState,
    setFederationCurrency,
} = currencySlice.actions

/*** Async thunk actions ***/
export const updateHistoricalCurrencyRates = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        btcUsdRate: number
        fiatUsdRates: Record<string, number | undefined>
        federationId?: Federation['id']
    },
    { state: CommonState }
>(
    'currency/updateHistoricalCurrencyRates',
    async (
        { fedimint, btcUsdRate, fiatUsdRates, federationId },
        { dispatch, getState },
    ) => {
        const s = getState()
        const selectedCurrency = selectCurrency(s, federationId)

        if (
            btcUsdRate === undefined ||
            fiatUsdRates === undefined ||
            !selectedCurrency
        ) {
            log.warn(
                'Missing BTC to USD rate, fiat rates, or selected currency',
            )
            throw new Error('Missing required currency data')
        }

        let btcToFiatHundredths: number | undefined

        if (selectedCurrency === 'USD') {
            btcToFiatHundredths = Math.round(btcUsdRate * 100)
            log.info(
                `Updating cached fiat rate for USD: ${btcToFiatHundredths} in btcToFiatHundredths`,
            )
        } else {
            const selectedExchangeRate = fiatUsdRates[selectedCurrency]
            if (!selectedExchangeRate || selectedExchangeRate <= 0) {
                log.error(
                    `Invalid exchange rate for ${selectedCurrency}: ${selectedExchangeRate}`,
                )
                throw new Error(`Invalid exchange rate for ${selectedCurrency}`)
            }
            btcToFiatHundredths = Math.round(
                (btcUsdRate * 100) / selectedExchangeRate,
            )
            log.info(
                `Updating cached fiat rate for ${selectedCurrency}: ${btcToFiatHundredths} (btcUsdRate: ${btcUsdRate} * 100 / exchangeRate: ${selectedExchangeRate})`,
            )
        }

        try {
            const { success, fiatCode } = await dispatch(
                updateCachedFiatFXInfo({
                    fedimint,
                    fiatCode: selectedCurrency,
                    btcToFiatHundredths,
                }),
            ).unwrap()

            log.info(
                `Successfully updated the rate for ${fiatCode}. Success: ${success}`,
            )
        } catch (error) {
            log.error(
                `Failed to dispatch exchange rate update for ${selectedCurrency}:`,
                error,
            )
            throw error
        }
    },
)

export const refreshHistoricalCurrencyRates = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; federationId?: Federation['id'] },
    { state: CommonState }
>(
    'currency/refreshHistoricalCurrencyRates',
    async ({ fedimint, federationId }, { dispatch, getState }) => {
        // Check if onboarding is completed first
        const state = getState()
        if (!state.environment.onboardingCompleted) {
            log.debug(
                'Skipping currency rates refresh - onboarding not completed',
            )
            return
        }

        try {
            const { btcUsdRate, fiatUsdRates } = await dispatch(
                fetchCurrencyPrices(),
            ).unwrap()

            log.debug('Fetched latest currency prices, initiating update.')

            await dispatch(
                updateHistoricalCurrencyRates({
                    fedimint,
                    btcUsdRate,
                    fiatUsdRates,
                    federationId,
                }),
            ).unwrap()
        } catch (_err: unknown) {
            log.warn('Failed to refresh historical currency rates')
            throw _err
        }
    },
)

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

export const updateCachedFiatFXInfo = createAsyncThunk<
    { success: boolean; fiatCode: string },
    { fedimint: FedimintBridge; fiatCode: string; btcToFiatHundredths: number }
>(
    'currency/updateCachedFiatFXInfo',
    async ({ fedimint, fiatCode, btcToFiatHundredths }) => {
        try {
            await fedimint.updateCachedFiatFXInfo(fiatCode, btcToFiatHundredths)
            return { success: true, fiatCode }
        } catch (error) {
            log.error(
                `Error updating cached fiat FX info for ${fiatCode}:`,
                error,
            )
            throw error
        }
    },
)

/*** Selectors ***/

export const selectCurrencyLocale = (s: CommonState) =>
    s.currency.currencyLocale

export const selectOverrideCurrency = (s: CommonState) =>
    s.currency.overrideCurrency

export const selectShowFiatTotalBalance = (s: CommonState) =>
    s.currency.showFiatTotalBalance

export const selectCurrency = (
    s: CommonState,
    federationId?: Federation['id'],
) => {
    // First use global override
    const overrideCurrency = selectOverrideCurrency(s)
    if (overrideCurrency) return overrideCurrency

    // Then use federation currency
    if (federationId) {
        const federationCurrency = selectFederationCurrency(s, federationId)
        if (federationCurrency) return federationCurrency
    }

    // Fallback to USD
    return SupportedCurrency.USD
}

export const selectFederationDefaultCurrency = (
    s: CommonState,
    federationId: Federation['id'],
) => {
    const loadedFederations = selectLoadedFederations(s)
    const federation = loadedFederations.find(f => f.id === federationId)

    if (federation) {
        return (
            getFederationDefaultCurrency(federation.meta) ??
            SupportedCurrency.USD
        )
    }

    return SupportedCurrency.USD
}

export const selectFederationCurrency = (
    s: CommonState,
    federationId: string,
) => {
    // Check custom federation currency first (highest priority)
    const customCurrency = s.currency.customFederationCurrencies[federationId]
    if (customCurrency) {
        return customCurrency
    }

    // Then check global override (medium priority)
    const overrideCurrency = selectOverrideCurrency(s)
    if (overrideCurrency) {
        return overrideCurrency
    }

    // Finally fall back to federation default (lowest priority)
    return selectFederationDefaultCurrency(s, federationId)
}

export const selectFederationCurrencies = (
    s: CommonState,
    federationId: Federation['id'],
) => {
    const defaultCurrency = selectFederationDefaultCurrency(s, federationId)
    const currencies = getSelectableCurrencies()

    return Object.fromEntries(
        Object.entries(currencies).filter(([a]) => a !== defaultCurrency),
    )
}

export const selectBtcUsdExchangeRate = (
    s: CommonState,
    federationId?: Federation['id'],
) => {
    const stabilityPoolPriceCents = selectStabilityPoolCycleStartPrice(
        s,
        federationId || '',
    )
    // use stability pool price if available, otherwise use fallback rate
    return federationId && stabilityPoolPriceCents
        ? stabilityPoolPriceCents / 100
        : s.currency.btcUsdRate || 0
}

export const selectBtcExchangeRate = (
    s: CommonState,
    customCurrency?: SelectableCurrency,
    federationId?: Federation['id'],
) => {
    const currency = customCurrency ?? selectCurrency(s, federationId || '')
    const metadata = selectFederationMetadata(s, federationId || '')
    const btcUsdRate = selectBtcUsdExchangeRate(s, federationId)

    let fiatUsdRate = s.currency.fiatUsdRates[currency] || 0

    // Special case for Togo farmers using CFA, where a metadata override
    // provides the exchange rate directly if the default_currency
    // is selected
    // TODO: Remove me? Do we want to keep supporting this feature?
    if (metadata) {
        const defaultCurrency = getFederationDefaultCurrency(metadata)
        if (defaultCurrency && defaultCurrency === currency) {
            const federationFixedExchangeRate =
                getFederationFixedExchangeRate(metadata)
            if (federationFixedExchangeRate) {
                return federationFixedExchangeRate
            }
        }
    }

    const currencyCode = getCurrencyCode(currency)

    // Special case for the CFA franc which is a fixed rate to the dollar
    // TODO: Remove me when CFA is added to price oracle.
    if (
        // XAF and XOF both map to CFA, so just for consistency we need to check for both
        (currencyCode === SupportedCurrency.XAF ||
            currencyCode === SupportedCurrency.XOF) &&
        !fiatUsdRate
    ) {
        fiatUsdRate = 0.0016
    }

    return currency === SupportedCurrency.USD
        ? btcUsdRate
        : fiatUsdRate !== 0 // avoid dividing by zero which spams annoying warnings in selectors
          ? btcUsdRate / fiatUsdRate
          : 0
}
