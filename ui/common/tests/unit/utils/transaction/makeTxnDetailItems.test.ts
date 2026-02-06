import { act } from '@testing-library/react'

import { useAmountFormatter, useBtcFiatPrice } from '../../../../hooks/amount'
import { fetchCurrencyPrices, setupStore } from '../../../../redux'
import { MSats, SupportedCurrency, UsdCents } from '../../../../types'
import { RpcSPDepositState } from '../../../../types/bindings'
import { makeTxnDetailItems } from '../../../../utils/transaction'
import { renderHookWithState } from '../../../utils/render'
import { createMockT } from '../../../utils/setup'
import {
    makeTestLnPayState,
    makeTestTxnEntry,
    makeTestSPDepositState,
    makeTestSPWithdrawalState,
    TEST_LN_INVOICE,
    TEST_ONCHAIN_ADDRESS,
    TEST_PREIMAGE,
} from '../../../utils/transaction'

describe('makeTxnDetailItems', () => {
    const t = createMockT()
    const store = setupStore()

    let makeFormattedAmountsFromMSats: ReturnType<
        typeof useAmountFormatter
    >['makeFormattedAmountsFromMSats']
    let convertCentsToFormattedFiat: ReturnType<
        typeof useBtcFiatPrice
    >['convertCentsToFormattedFiat']

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
        const { result: btcFiatPriceResult } = renderHookWithState(
            () => useBtcFiatPrice(),
            store,
        )
        makeFormattedAmountsFromMSats =
            result.current.makeFormattedAmountsFromMSats
        convertCentsToFormattedFiat =
            btcFiatPriceResult.current.convertCentsToFormattedFiat
    })

    it('should contain the type, status, and time of a transaction', () => {
        const time = new Date('Jan 1, 2023').getTime()
        const txn = makeTestTxnEntry('lnPay', {
            createdAt: time / 1000,
        })
        const items = makeTxnDetailItems(
            t,
            txn,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(items).toContainEqual({
            label: t('words.type'),
            value: t('words.lightning'),
        })
        expect(items).toContainEqual({
            label: t('words.status'),
            value: t('words.pending'),
        })
        expect(items).toContainEqual({
            label: t('words.time'),
            value: 'Jan 01 2023, 12:00am',
        })
    })

    it('should contain the current value and withdrawal value of stability pool transactions', () => {
        const spWithdraw = makeTestTxnEntry('spWithdraw', {
            state: {
                ...makeTestSPWithdrawalState('completeWithdrawal'),
                estimated_withdrawal_cents: 1 as UsdCents,
            },
            amount: 100_000 as MSats,
        })
        const spDeposit = makeTestTxnEntry('spDeposit', {
            state: {
                ...makeTestSPDepositState('completeDeposit'),
                initial_amount_cents: 1 as UsdCents,
            } as Extract<RpcSPDepositState, { type: 'completeDeposit' }>,
            amount: 100_000 as MSats,
        })
        const spv2Withdraw = makeTestTxnEntry('sPV2Withdrawal', {
            amount: 100_000 as MSats,
        })
        const sPV2Deposit = makeTestTxnEntry(
            'sPV2Deposit',

            {
                amount: 100_000 as MSats,
            },
        )

        const spWithdrawItems = makeTxnDetailItems(
            t,
            spWithdraw,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(spWithdrawItems).toContainEqual({
            label: t('feature.stabilitypool.current-value'),
            value: '0.10 USD',
        })
        expect(spWithdrawItems).toContainEqual({
            label: t('feature.stabilitypool.withdrawal-value'),
            value: '0.01 USD',
        })

        const spDepositItems = makeTxnDetailItems(
            t,
            spDeposit,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(spDepositItems).toContainEqual({
            label: t('feature.stabilitypool.current-value'),
            value: '0.10 USD',
        })
        expect(spDepositItems).toContainEqual({
            label: t('feature.stabilitypool.withdrawal-value'),
            value: '0.01 USD',
        })
        expect(spDepositItems).toContainEqual({
            label: t('feature.stabilitypool.deposit-to'),
            value: t('feature.stabilitypool.currency-balance', {
                currency: SupportedCurrency.USD,
            }),
        })

        const spv2WithdrawItems = makeTxnDetailItems(
            t,
            spv2Withdraw,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(spv2WithdrawItems).toContainEqual({
            label: t('feature.stabilitypool.current-value'),
            value: '0.10 USD',
        })

        const sPV2DepositItems = makeTxnDetailItems(
            t,
            sPV2Deposit,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(sPV2DepositItems).toContainEqual({
            label: t('feature.stabilitypool.current-value'),
            value: '0.10 USD',
        })
        expect(sPV2DepositItems).toContainEqual({
            label: t('feature.stabilitypool.deposit-to'),
            value: t('feature.stabilitypool.currency-balance', {
                currency: SupportedCurrency.USD,
            }),
        })
    })

    it('should contain an item with the lightning invoice for lightning transactions', () => {
        const lnPay = makeTestTxnEntry('lnPay')
        const lnReceive = makeTestTxnEntry('lnReceive')

        const lnPayItems = makeTxnDetailItems(
            t,
            lnPay,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )
        const lnReceiveItems = makeTxnDetailItems(
            t,
            lnReceive,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(lnPayItems).toContainEqual({
            label: t('phrases.lightning-request'),
            value: TEST_LN_INVOICE,
            copiedMessage: t('phrases.copied-lightning-request'),
            copyable: true,
            truncated: true,
        })
        expect(lnReceiveItems).toContainEqual({
            label: t('phrases.lightning-request'),
            value: TEST_LN_INVOICE,
            copiedMessage: t('phrases.copied-lightning-request'),
            copyable: true,
            truncated: true,
        })
    })

    it('should show the preimage for successful lightning payments', () => {
        const lnPay = makeTestTxnEntry('lnPay', {
            state: makeTestLnPayState('success'),
        })

        const items = makeTxnDetailItems(
            t,
            lnPay,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(items).toContainEqual({
            label: t('words.preimage'),
            value: TEST_PREIMAGE,
            copiedMessage: t('phrases.copied-to-clipboard'),
            copyable: true,
            truncated: true,
        })
    })

    it('should contain an item with the onchain address for onchain transactions', () => {
        const onchainWithdraw = makeTestTxnEntry('onchainWithdraw')
        const onchainDeposit = makeTestTxnEntry('onchainDeposit')

        const onchainWithdrawItems = makeTxnDetailItems(
            t,
            onchainWithdraw,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )
        const onchainDepositItems = makeTxnDetailItems(
            t,
            onchainDeposit,
            SupportedCurrency.USD,
            'sats',
            makeFormattedAmountsFromMSats,
            convertCentsToFormattedFiat,
        )

        expect(onchainWithdrawItems).toContainEqual({
            label: t('words.to'),
            value: TEST_ONCHAIN_ADDRESS,
            copiedMessage: t('phrases.copied-bitcoin-address'),
            copyable: true,
            truncated: true,
        })
        expect(onchainDepositItems).toContainEqual({
            label: t('words.address'),
            value: TEST_ONCHAIN_ADDRESS,
            copiedMessage: t('phrases.copied-bitcoin-address'),
            copyable: true,
            truncated: true,
        })
    })
})
