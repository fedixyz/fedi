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
        expect(result.current.formattedBalance).toBe(
            `${balanceFiat} USD (${balanceSats} SATS)`,
        )
        expect(result.current.formattedBalanceText).toBe(
            `${i18next.t('words.balance')}: ${balanceFiat} USD (${balanceSats} SATS)`,
        )
    })
})
