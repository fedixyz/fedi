import { fetchCurrencyPrices, setupStore } from '../../../redux'
import { SupportedCurrency } from '../../../types'

const OFFICIAL_CUP_USD_RATE = 0.041666666666666664 // 24 CUP per USD

const mockPriceFeed = {
    prices: {
        'BTC/USD': { rate: 86305, timestamp: new Date().toString() },
        'CUP/USD': {
            rate: OFFICIAL_CUP_USD_RATE,
            timestamp: new Date().toString(),
        },
        'EUR/USD': { rate: 1.1, timestamp: new Date().toString() },
    },
}

const mockYadioCupRate = { result: 720, rate: 720 } // 720 CUP per USD

const mockFetch = (overrides: {
    priceFeed?: () => Promise<unknown>
    yadio?: () => Promise<unknown>
} = {}) => {
    const fetcher = (url: unknown) => {
        const urlString = String(url)
        if (urlString.includes('price-feed.dev.fedibtc.com')) {
            return overrides.priceFeed
                ? overrides.priceFeed()
                : Promise.resolve({
                      json: () => Promise.resolve(mockPriceFeed),
                  })
        }
        if (urlString.includes('api.yadio.io')) {
            return overrides.yadio
                ? overrides.yadio()
                : Promise.resolve({
                      json: () => Promise.resolve(mockYadioCupRate),
                  })
        }
        return Promise.reject(new Error('network error'))
    }
    global.fetch = jest.fn(fetcher) as unknown as typeof fetch
}

describe('fetchCurrencyPrices', () => {
    afterEach(() => {
        jest.clearAllMocks()
    })

    it('serves the real CUP/USD market rate from Yadio instead of the official price feed rate', async () => {
        mockFetch()
        const store = setupStore()

        const { btcUsdRate, fiatUsdRates } = await store
            .dispatch(fetchCurrencyPrices())
            .unwrap()

        expect(btcUsdRate).toBe(86305)
        expect(fiatUsdRates[SupportedCurrency.CUP]).toBeCloseTo(1 / 720)
        expect(
            store.getState().currency.fiatUsdRates[SupportedCurrency.CUP],
        ).toBeCloseTo(1 / 720)
    })

    it('keeps other fiat rates from the price feed untouched', async () => {
        mockFetch()
        const store = setupStore()

        const { fiatUsdRates } = await store
            .dispatch(fetchCurrencyPrices())
            .unwrap()

        expect(fiatUsdRates['EUR']).toBe(1.1)
    })

    it('falls back to the price feed CUP/USD rate when Yadio is unavailable', async () => {
        mockFetch({ yadio: () => Promise.reject(new Error('network down')) })
        const store = setupStore()

        const { fiatUsdRates } = await store
            .dispatch(fetchCurrencyPrices())
            .unwrap()

        expect(fiatUsdRates[SupportedCurrency.CUP]).toBe(OFFICIAL_CUP_USD_RATE)
    })

    it('falls back to the price feed CUP/USD rate when Yadio returns an invalid rate', async () => {
        mockFetch({
            yadio: () => Promise.resolve({ json: () => Promise.resolve({ rate: 0 }) }),
        })
        const store = setupStore()

        const { fiatUsdRates } = await store
            .dispatch(fetchCurrencyPrices())
            .unwrap()

        expect(fiatUsdRates[SupportedCurrency.CUP]).toBe(OFFICIAL_CUP_USD_RATE)
    })

    it('rejects when the price feed is missing the BTC/USD rate', async () => {
        mockFetch({
            priceFeed: () =>
                Promise.resolve({
                    json: () =>
                        Promise.resolve({
                            prices: {
                                'CUP/USD': {
                                    rate: OFFICIAL_CUP_USD_RATE,
                                    timestamp: new Date().toString(),
                                },
                            },
                        }),
                }),
        })
        const store = setupStore()

        let error: unknown
        try {
            await store.dispatch(fetchCurrencyPrices()).unwrap()
        } catch (e) {
            error = e
        }
        expect((error as Error).message).toBe(
            'Missing required BTC/USD rate from price feed',
        )
    })
})