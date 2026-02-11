import { act } from '@testing-library/react'
import i18next from 'i18next'

import { createIntegrationTestBuilder } from '@fedi/common/tests/utils/remote-bridge-setup'
import { renderHookWithBridge } from '@fedi/common/tests/utils/render'

import { useBalance } from '../../../../hooks/amount'
import {
    fetchCurrencyPrices,
    selectLastUsedFederation,
    selectTotalBalanceMsats,
} from '../../../../redux'
import { SupportedCurrency } from '../../../../types/fedimint'
import amountUtils from '../../../../utils/AmountUtils'

describe('useBalance hook', () => {
    const builder = createIntegrationTestBuilder()
    const context = builder.getContext()

    it('should return the balance for a given federation', async () => {
        await builder.withFederationJoined()
        await builder.withEcashReceived(10000)

        const { store, bridge } = context

        act(() => {
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {},
                },
            })
        })

        const federation = selectLastUsedFederation(store.getState())
        const balance = selectTotalBalanceMsats(store.getState())

        const balanceSats = amountUtils.msatToSat(balance)
        // For the sake of this test, 1000 sats = 1 USD
        // See the `btcUsdRate` being set above
        const balanceFiat = (balanceSats / 1000).toFixed(2)

        const { result } = renderHookWithBridge(
            () => useBalance(i18next.t, federation?.id ?? ''),
            store,
            bridge.fedimint,
        )

        expect(result.current.satsBalance).toBe(balanceSats)
        expect(result.current.formattedBalanceFiat).toBe(`${balanceFiat} USD`)
        expect(result.current.formattedBalanceSats).toBe(`${balanceSats} SATS`)
        expect(result.current.formattedBalanceBitcoin).toBe(
            `${balanceSats} SATS`,
        )
        expect(result.current.formattedBalance).toBe(
            `${balanceFiat} USD (${balanceSats} SATS)`,
        )
        expect(result.current.formattedBalanceText).toBe(
            `${i18next.t('words.balance')}: ${balanceFiat} USD (${balanceSats} SATS)`,
        )
    })

    it('should show BTC balance when balance is >1M sats', async () => {
        const btcUsdRate = 100000
        await builder.withFederationJoined()
        await builder.withEcashReceived(1000000000)

        const { store, bridge } = context

        act(() => {
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate,
                    fiatUsdRates: {},
                },
            })
        })

        const federation = selectLastUsedFederation(store.getState())
        const balance = selectTotalBalanceMsats(store.getState())

        const balanceSats = amountUtils.msatToSat(balance)
        const balanceBtc = amountUtils.msatToBtc(balance).toFixed(2)
        const balanceFiat = amountUtils.formatFiat(
            amountUtils.satToFiat(balanceSats, btcUsdRate),
            SupportedCurrency.USD,
            { symbolPosition: 'none' },
        )

        const { result } = renderHookWithBridge(
            () => useBalance(i18next.t, federation?.id ?? ''),
            store,
            bridge.fedimint,
        )

        expect(result.current.satsBalance).toBe(balanceSats)
        // For the sake of this test, 1M sats = 1000 USD
        // See the `btcUsdRate` being set above
        expect(result.current.formattedBalanceFiat).toBe(`${balanceFiat} USD`)
        expect(result.current.formattedBalanceBitcoin).toBe(`${balanceBtc} BTC`)
        expect(result.current.formattedBalance).toBe(
            `${balanceFiat} USD (${balanceBtc} BTC)`,
        )
        expect(result.current.formattedBalanceText).toBe(
            `${i18next.t('words.balance')}: ${balanceFiat} USD (${balanceBtc} BTC)`,
        )
    })
})
