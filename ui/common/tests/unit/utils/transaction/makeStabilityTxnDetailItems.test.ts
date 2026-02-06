import { act } from '@testing-library/react'

import { useAmountFormatter } from '../../../../hooks/amount'
import { fetchCurrencyPrices, setupStore } from '../../../../redux'
import { MSats } from '../../../../types'
import { makeStabilityTxnDetailItems } from '../../../../utils/transaction'
import { renderHookWithState } from '../../../utils/render'
import { createMockT } from '../../../utils/setup'
import { makeTestTxnEntry } from '../../../utils/transaction'

describe('makeStabilityTxnDetailItems', () => {
    const t = createMockT()
    const store = setupStore()

    let makeFormattedAmountsFromMSats: ReturnType<
        typeof useAmountFormatter
    >['makeFormattedAmountsFromMSats']

    beforeEach(() => {
        jest.clearAllMocks()

        act(() => {
            store.dispatch({
                type: fetchCurrencyPrices.fulfilled.type,
                payload: {
                    btcUsdRate: 100000,
                    fiatUsdRates: {
                        EUR: 1.1, // 1 EUR = 1.1 USD
                    },
                },
            })
        })

        const { result } = renderHookWithState(
            () => useAmountFormatter(),
            store,
        )
        makeFormattedAmountsFromMSats =
            result.current.makeFormattedAmountsFromMSats
    })

    it('should contain the time and status of a stability pool transaction', () => {
        const time = new Date('Jan 1, 2023').getTime()
        const txn = makeTestTxnEntry('spDeposit', {
            createdAt: time / 1000,
        })
        const items = makeStabilityTxnDetailItems(
            t,
            txn,
            makeFormattedAmountsFromMSats,
        )

        expect(items).toContainEqual({
            label: t('words.status'),
            value: t('words.pending'),
        })
        expect(items).toContainEqual({
            label: t('words.time'),
            value: 'Jan 01 2023, 12:00am',
        })
    })

    it('should show transaction amount for transactions with a non-zero amount', () => {
        const spDeposit = makeTestTxnEntry('spDeposit', {
            amount: 100_000 as MSats,
        })
        const sPV2Deposit = makeTestTxnEntry('sPV2Deposit', {
            amount: 200_000 as MSats,
        })
        const sPV2TransferIn = makeTestTxnEntry('sPV2TransferIn', {
            amount: 300_000 as MSats,
        })
        const spWithdraw = makeTestTxnEntry('spWithdraw', {
            amount: 400_000 as MSats,
        })
        const sPV2Withdrawal = makeTestTxnEntry('sPV2Withdrawal', {
            amount: 500_000 as MSats,
        })
        const sPV2TransferOut = makeTestTxnEntry('sPV2TransferOut', {
            amount: 600_000 as MSats,
        })

        expect(
            makeStabilityTxnDetailItems(
                t,
                spDeposit,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.deposit-amount'),
            value: '100 SATS',
        })
        expect(
            makeStabilityTxnDetailItems(
                t,
                sPV2Deposit,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.deposit-amount'),
            value: '200 SATS',
        })
        expect(
            makeStabilityTxnDetailItems(
                t,
                sPV2TransferIn,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.deposit-amount'),
            value: '300 SATS',
        })
        expect(
            makeStabilityTxnDetailItems(
                t,
                spWithdraw,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.withdrawal-amount'),
            value: '400 SATS',
        })
        expect(
            makeStabilityTxnDetailItems(
                t,
                sPV2Withdrawal,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.withdrawal-amount'),
            value: '500 SATS',
        })
        expect(
            makeStabilityTxnDetailItems(
                t,
                sPV2TransferOut,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.transfer-amount'),
            value: '600 SATS',
        })
    })
})
