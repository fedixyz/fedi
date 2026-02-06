import { act } from '@testing-library/react'

import { useAmountFormatter } from '../../../../hooks/amount'
import { fetchCurrencyPrices, setupStore } from '../../../../redux'
import { MSats } from '../../../../types'
import { makeStabilityTxnFeeDetails } from '../../../../utils/transaction'
import { renderHookWithState } from '../../../utils/render'
import { createMockT } from '../../../utils/setup'
import {
    makeTestFediFeeStatus,
    makeTestTxnEntry,
    makeTestSPDepositState,
    makeTestSPV2DepositState,
} from '../../../utils/transaction'

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

    it('should display the fedi fee for stability transactions', () => {
        const txn = makeTestTxnEntry('sPV2Deposit', {
            // For the sake of this test, the fedi fee is 10 sats
            fediFeeStatus: makeTestFediFeeStatus('success', 10_000),
        })

        expect(
            makeStabilityTxnFeeDetails(t, txn, makeFormattedAmountsFromMSats),
        ).toContainEqual({
            label: t('phrases.fedi-fee'),
            formattedAmount: '0.01 USD (10 SATS)',
        })
    })

    it('should display the fees paid (so far) for deposits', () => {
        const spDeposit = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('completeDeposit', {
                fees_paid_so_far: 11_000 as MSats,
            }),
        })
        const sPV2Deposit = makeTestTxnEntry('sPV2Deposit', {
            state: makeTestSPV2DepositState('completedDeposit', {
                fees_paid_so_far: 12_000 as MSats,
            }),
        })

        expect(
            makeStabilityTxnFeeDetails(
                t,
                spDeposit,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.fees-paid'),
            formattedAmount: '0.01 USD (11 SATS)',
        })
        expect(
            makeStabilityTxnFeeDetails(
                t,
                sPV2Deposit,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('feature.stabilitypool.fees-paid'),
            formattedAmount: '0.01 USD (12 SATS)',
        })
    })

    it('should display the total fees for various stability transactions', () => {
        const txn = makeTestTxnEntry('spDeposit', {
            state: makeTestSPDepositState('completeDeposit', {
                fees_paid_so_far: 20_000 as MSats,
            }),
            fediFeeStatus: makeTestFediFeeStatus('success', 10_000),
        })

        expect(
            makeStabilityTxnFeeDetails(t, txn, makeFormattedAmountsFromMSats),
        ).toContainEqual({
            label: t('phrases.total-fees'),
            formattedAmount: '0.03 USD (30 SATS)',
        })
    })
})
