import { act } from '@testing-library/react'
import { t } from 'i18next'

import { useBtcFiatPrice } from '../../../../hooks/amount'
import { fetchCurrencyPrices, setupStore } from '../../../../redux'
import { makeNameWithSuffix } from '../../../../utils/matrix'
import { makeMultispendTxnDetailItems } from '../../../../utils/transaction'
import { mockRoomMembers } from '../../../mock-data/matrix-event'
import { renderHookWithState } from '../../../utils/render'
import {
    makeTestMultispendTxnEntry,
    makeTestMultispendWithdrawRequest,
    TEST_TXID,
} from '../../../utils/transaction'

describe('makeMultispendTxnDetailItems', () => {
    const store = setupStore()

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

        const { result: btcFiatPriceResult } = renderHookWithState(
            () => useBtcFiatPrice(),
            store,
        )
        convertCentsToFormattedFiat =
            btcFiatPriceResult.current.convertCentsToFormattedFiat
    })

    it('should contain the type and time of a transaction', () => {
        const time = new Date('Jan 1, 2023').getTime()
        const txn = makeTestMultispendTxnEntry('deposit', {
            // TODO:TEST: Pass in time / 1000 to match other *TxnDetailItems functions
            time,
        })
        const items = makeMultispendTxnDetailItems(
            t,
            txn,
            mockRoomMembers,
            convertCentsToFormattedFiat,
        )

        expect(items).toContainEqual({
            label: t('words.type'),
            value: t('words.multispend'),
        })
        expect(items).toContainEqual({
            label: t('words.time'),
            value: 'Jan 01 2023, 12:00am',
        })
    })

    it('should show the depositor and amount for a deposit', () => {
        const txn = makeTestMultispendTxnEntry('deposit', {
            event: {
                depositNotification: {
                    user: mockRoomMembers[0].id,
                    fiatAmount: 100,
                    txid: TEST_TXID,
                    description: '',
                },
            },
        })

        const items = makeMultispendTxnDetailItems(
            t,
            txn,
            mockRoomMembers,
            convertCentsToFormattedFiat,
        )

        expect(items).toContainEqual({
            label: t('words.depositor'),
            value: makeNameWithSuffix(mockRoomMembers[0]),
        })
        expect(items).toContainEqual({
            label: t('words.amount'),
            value: '1.00 USD',
        })
    })

    it('should show the withdrawer and amount for a withdrawal', () => {
        const txn = makeTestMultispendTxnEntry('withdrawal', {
            event: {
                withdrawalRequest: {
                    ...makeTestMultispendWithdrawRequest('accepted'),
                    sender: mockRoomMembers[0].id,
                    request: { transfer_amount: 100 },
                },
            },
        })

        const items = makeMultispendTxnDetailItems(
            t,
            txn,
            mockRoomMembers,
            convertCentsToFormattedFiat,
        )

        expect(items).toContainEqual({
            label: t('words.withdrawer'),
            value: makeNameWithSuffix(mockRoomMembers[0]),
        })
        expect(items).toContainEqual({
            label: t('words.amount'),
            value: '1.00 USD',
        })
    })
})
