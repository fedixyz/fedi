import { act } from '@testing-library/react'

import { useAmountFormatter } from '../../../../hooks/amount'
import { fetchCurrencyPrices, setupStore } from '../../../../redux'
import { MSats } from '../../../../types'
import { makeTxnFeeDetails } from '../../../../utils/transaction'
import { renderHookWithState } from '../../../utils/render'
import { createMockT } from '../../../utils/setup'
import {
    makeTestFediFeeStatus,
    makeTestTxnEntry,
} from '../../../utils/transaction'

describe('makeTxnFeeDetails', () => {
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

    it('should display the fedi fee for success/pendingSend transactions', () => {
        const txn = makeTestTxnEntry('lnPay', {
            // For the sake of this test, the fedi fee is 10 sats
            fediAppFeeStatus: makeTestFediFeeStatus('success', 10_000),
        })
        const txnPendingFee = makeTestTxnEntry('lnPay', {
            fediAppFeeStatus: makeTestFediFeeStatus('pendingSend', 10_000),
        })

        const detailsFeeSuccess = makeTxnFeeDetails(
            t,
            txn,
            makeFormattedAmountsFromMSats,
        )
        const detailsFeePending = makeTxnFeeDetails(
            t,
            txnPendingFee,
            makeFormattedAmountsFromMSats,
        )

        expect(detailsFeeSuccess).toEqual(detailsFeePending)
        expect(detailsFeeSuccess).toContainEqual({
            label: t('phrases.fedi-fee'),
            formattedAmount: '0.01 USD (10 SATS)',
        })
    })

    it('should display the guardian fee for success/pendingSend transactions', () => {
        const txn = makeTestTxnEntry('lnPay', {
            fediGuardianFeeStatus: makeTestFediFeeStatus('success', 10_000),
        })
        const txnPendingFee = makeTestTxnEntry('lnPay', {
            fediGuardianFeeStatus: makeTestFediFeeStatus('pendingSend', 10_000),
        })

        const detailsFeeSuccess = makeTxnFeeDetails(
            t,
            txn,
            makeFormattedAmountsFromMSats,
        )
        const detailsFeePending = makeTxnFeeDetails(
            t,
            txnPendingFee,
            makeFormattedAmountsFromMSats,
        )

        expect(detailsFeeSuccess).toEqual(detailsFeePending)
        expect(detailsFeeSuccess).toContainEqual({
            label: t('phrases.guardian-fee'),
            formattedAmount: '0.01 USD (10 SATS)',
        })
    })

    it('should display the guardian fee for success/pendingSend transactions', () => {
        const txn = makeTestTxnEntry('lnPay', {
            fediGuardianFeeStatus: makeTestFediFeeStatus('success', 10_000),
        })
        const txnPendingFee = makeTestTxnEntry('lnPay', {
            fediGuardianFeeStatus: makeTestFediFeeStatus('pendingSend', 10_000),
        })

        const detailsFeeSuccess = makeTxnFeeDetails(
            t,
            txn,
            makeFormattedAmountsFromMSats,
        )
        const detailsFeePending = makeTxnFeeDetails(
            t,
            txnPendingFee,
            makeFormattedAmountsFromMSats,
        )

        expect(detailsFeeSuccess).toEqual(detailsFeePending)
        expect(detailsFeeSuccess).toContainEqual({
            label: t('phrases.guardian-fee'),
            formattedAmount: '0.01 USD (10 SATS)',
        })
    })

    it('should display the lightning fee for lightning payment transactions', () => {
        const txn = makeTestTxnEntry('lnPay', {
            // For the sake of this test, the lightning fee is 20 sats
            lightning_fees: 20_000 as MSats,
        })

        expect(
            makeTxnFeeDetails(t, txn, makeFormattedAmountsFromMSats),
        ).toContainEqual({
            label: t('phrases.lightning-network'),
            formattedAmount: '0.02 USD (20 SATS)',
        })
    })

    it('should display the network fee for an onchain withdraw transaction', () => {
        const txn = makeTestTxnEntry('onchainWithdraw', {
            // For the sake of this test, the network fee is 30 sats
            onchain_fees: 30_000 as MSats,
        })

        expect(
            makeTxnFeeDetails(t, txn, makeFormattedAmountsFromMSats),
        ).toContainEqual({
            label: t('phrases.network-fee'),
            formattedAmount: '0.03 USD (30 SATS)',
        })
    })

    it('should display the total fees for various transactions', () => {
        const lnTxn = makeTestTxnEntry('lnPay', {
            // For the sake of this test, the fedi fee is 10 sats
            fediAppFeeStatus: makeTestFediFeeStatus('success', 10_000),
            fediGuardianFeeStatus: makeTestFediFeeStatus('success', 10_000),
            // For the sake of this test, the lightning fee is 20 sats
            lightning_fees: 20_000 as MSats,
        })
        const onchainWithdrawTxn = makeTestTxnEntry('onchainWithdraw', {
            fediAppFeeStatus: makeTestFediFeeStatus('success', 10_000),
            // For the sake of this test, the network fee is 30 sats
            onchain_fees: 30_000 as MSats,
        })
        const onchainDepositTxn = makeTestTxnEntry('onchainDeposit', {
            fediAppFeeStatus: makeTestFediFeeStatus('success', 10_000),
            // For the sake of this test, the network fee is 30 sats
            peg_in_fees: 1_000_000 as MSats,
        })
        const oobTxn = makeTestTxnEntry('oobSend', {
            fediAppFeeStatus: makeTestFediFeeStatus('success', 50_000),
        })

        expect(
            makeTxnFeeDetails(t, lnTxn, makeFormattedAmountsFromMSats),
        ).toContainEqual({
            label: t('phrases.total-fees'),
            formattedAmount: '0.04 USD (40 SATS)',
        })
        expect(
            makeTxnFeeDetails(
                t,
                onchainWithdrawTxn,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('phrases.total-fees'),
            formattedAmount: '0.04 USD (40 SATS)',
        })
        expect(
            makeTxnFeeDetails(t, oobTxn, makeFormattedAmountsFromMSats),
        ).toContainEqual({
            label: t('phrases.total-fees'),
            formattedAmount: '0.05 USD (50 SATS)',
        })
        expect(
            makeTxnFeeDetails(
                t,
                onchainDepositTxn,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('phrases.peg-in-fee'),
            formattedAmount: '1.00 USD (1,000 SATS)',
        })
        expect(
            makeTxnFeeDetails(
                t,
                onchainDepositTxn,
                makeFormattedAmountsFromMSats,
            ),
        ).toContainEqual({
            label: t('phrases.total-fees'),
            formattedAmount: '1.01 USD (1,010 SATS)',
        })
    })
})
