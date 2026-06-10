import { waitFor } from '@testing-library/react'

import {
    useMultispendTxnDisplayUtils,
    useTransactionHistory,
    useTransactionHistoryList,
    useTxnDisplayUtils,
} from '@fedi/common/hooks/transactions'
import { setupStore, setFederations } from '@fedi/common/redux'
import { setMatrixRoomMultispendStatus } from '@fedi/common/redux/matrix'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import {
    MultispendTransactionListEntry,
    TransactionListEntry,
} from '@fedi/common/types'
import { RpcMultispendGroupStatus } from '@fedi/common/types/bindings'

import * as walletUtils from '../../../utils/transaction'
import { createMockTransaction } from '../../mock-data/transactions'
import { renderHookWithState } from '../../utils/render'
import { createMockT } from '../../utils/setup'
import {
    makeTestMultispendDepositEventData,
    makeTestTxnEntry,
} from '../../utils/transaction'

const mockDispatch = jest.fn()
jest.mock('@fedi/common/hooks/redux', () => ({
    ...jest.requireActual('@fedi/common/hooks/redux'),
    useCommonDispatch: () => mockDispatch,
}))

jest.mock('@fedi/common/hooks/amount', () => ({
    ...jest.requireActual('@fedi/common/hooks/amount'),
    useBtcFiatPrice: () => ({
        convertCentsToFormattedFiat: jest.fn(() => '100'),
    }),
}))

describe('common/hooks/transactions', () => {
    const t = createMockT()
    const store = setupStore()

    beforeEach(() => {
        jest.clearAllMocks()

        store.dispatch(setFederations([mockFederation1]))
    })

    describe('useMultispendTxnDisplayUtils', () => {
        const roomId = 'roomId'
        const status: RpcMultispendGroupStatus = {
            status: 'finalized',
            invite_event_id: 'invite_event_id',
            finalized_group: {
                invitation: {
                    signers: ['signer1', 'signer2'],
                    threshold: 2,
                    federationInviteCode: 'federationInviteCode',
                    federationName: 'federationName',
                },
                proposer: 'proposer',
                pubkeys: {
                    pubkey1: 'pubkey1',
                    pubkey2: 'pubkey2',
                },
                federationId: 'federationId',
            },
        }
        const txn = makeTestTxnEntry('multispendDeposit', {
            state: makeTestMultispendDepositEventData(100, 'description1'),
            time: 1677721600,
        }) as MultispendTransactionListEntry

        beforeEach(() => {
            store.dispatch(
                setMatrixRoomMultispendStatus({
                    roomId,
                    status,
                }),
            )
        })

        describe('makeMultispendTxnStatusText', () => {
            it('should return correct translation key for deposit transaction', () => {
                const { result } = renderHookWithState(
                    () => useMultispendTxnDisplayUtils(t, roomId),
                    store,
                )

                const response = result.current.makeMultispendTxnStatusText(txn)
                expect(response).toBe('words.deposit')
            })
        })

        describe('makeMultispendTxnNotesText', () => {
            it('should return correct notes for deposit transaction', () => {
                const { result } = renderHookWithState(() =>
                    useMultispendTxnDisplayUtils(t, roomId),
                )

                const response = result.current.makeMultispendTxnNotesText(txn)
                expect(response).toBe('description1')
            })
        })

        describe('makeMultispendTxnAmountText', () => {
            it('should return correct amount text for deposit transaction', () => {
                const { result } = renderHookWithState(
                    () => useMultispendTxnDisplayUtils(t, roomId),
                    store,
                )

                const response = result.current.makeMultispendTxnAmountText(
                    txn,
                    true,
                )
                expect(response).toBe('+100 USD')
            })
        })

        describe('makeMultispendTxnCurrencyText', () => {
            it('should return correct currency text for deposit transaction', () => {
                const { result } = renderHookWithState(
                    () => useMultispendTxnDisplayUtils(t, roomId),
                    store,
                )

                const response = result.current.makeMultispendTxnCurrencyText()
                expect(response).toBe('USD')
            })
        })

        describe('makeMultispendTxnTimestampText', () => {
            it('should return correct timestamp text for deposit transaction', () => {
                const { result } = renderHookWithState(
                    () => useMultispendTxnDisplayUtils(t, roomId),
                    store,
                )

                const response =
                    result.current.makeMultispendTxnTimestampText(txn)
                expect(response).toBe(1677722)
            })
        })

        describe('makeMultispendTxnAmountStateText', () => {
            it('should return correct amount state text for deposit transaction', () => {
                const { result } = renderHookWithState(
                    () => useMultispendTxnDisplayUtils(t, roomId),
                    store,
                )

                const response =
                    result.current.makeMultispendTxnAmountStateText(txn)
                expect(response).toBe('settled')
            })
        })
    })

    describe('useTransactionHistory', () => {
        describe('When the fetchTransactions function is called', () => {
            it('should call dispatch', async () => {
                mockDispatch.mockReturnValue({
                    unwrap: () => Promise.resolve([]),
                })

                const { result } = renderHookWithState(
                    () => useTransactionHistory('1'),
                    store,
                )

                await result.current.fetchTransactions()

                expect(mockDispatch).toHaveBeenCalled()
            })
        })

        describe('When the fetchStabilityTransactions function is called', () => {
            it('should fetch additional pages until a stable balance transaction is found', async () => {
                const bitcoinPage = [
                    makeTestTxnEntry('lnPay', { id: 'bitcoin-payment' }),
                ]
                const stablePage = [
                    makeTestTxnEntry('sPV2Deposit', {
                        id: 'stable-balance-deposit',
                    }),
                ]

                mockDispatch
                    .mockReturnValueOnce({
                        unwrap: () => Promise.resolve(bitcoinPage),
                    })
                    .mockReturnValueOnce({
                        unwrap: () => Promise.resolve(stablePage),
                    })

                const { result } = renderHookWithState(
                    () => useTransactionHistory('1'),
                    store,
                )

                await expect(
                    result.current.fetchStabilityTransactions(),
                ).resolves.toEqual(stablePage)

                expect(mockDispatch).toHaveBeenCalledTimes(2)
            })

            it('should stop fetching when the transaction history is exhausted', async () => {
                const bitcoinPage = [
                    makeTestTxnEntry('lnPay', { id: 'bitcoin-payment' }),
                ]

                mockDispatch
                    .mockReturnValueOnce({
                        unwrap: () => Promise.resolve(bitcoinPage),
                    })
                    .mockReturnValueOnce({
                        unwrap: () => Promise.resolve([]),
                    })

                const { result } = renderHookWithState(
                    () => useTransactionHistory('1'),
                    store,
                )

                await expect(
                    result.current.fetchStabilityTransactions(),
                ).resolves.toEqual([])

                expect(mockDispatch).toHaveBeenCalledTimes(2)
            })

            it('should keep paging on load more even when stable balance transactions are already cached', async () => {
                const federationId = '1'
                const existingStableTxn = makeTestTxnEntry('sPV2Deposit', {
                    id: 'existing-stable-balance-deposit',
                })
                const bitcoinPage = [
                    makeTestTxnEntry('lnPay', { id: 'bitcoin-payment' }),
                ]
                const nextStablePage = [
                    makeTestTxnEntry('sPV2Withdrawal', {
                        id: 'next-stable-balance-withdrawal',
                    }),
                ]
                const storeWithStableTxn = setupStore({
                    transactions: {
                        [federationId]: {
                            transactions: [existingStableTxn],
                        },
                    },
                })

                mockDispatch
                    .mockReturnValueOnce({
                        unwrap: () => Promise.resolve(bitcoinPage),
                    })
                    .mockReturnValueOnce({
                        unwrap: () => Promise.resolve(nextStablePage),
                    })

                const { result } = renderHookWithState(
                    () => useTransactionHistory(federationId),
                    storeWithStableTxn,
                )

                await expect(
                    result.current.fetchStabilityTransactions({ more: true }),
                ).resolves.toEqual(nextStablePage)

                expect(mockDispatch).toHaveBeenCalledTimes(2)
            })
        })
    })

    describe('useTransactionHistoryList', () => {
        it('should fetch transactions on mount', async () => {
            mockDispatch.mockReturnValue({
                unwrap: () => Promise.resolve([]),
            })

            renderHookWithState(
                () =>
                    useTransactionHistoryList({
                        federationId: '1',
                        type: 'transactions',
                    }),
                store,
            )

            await waitFor(() => {
                expect(mockDispatch).toHaveBeenCalledTimes(1)
            })
        })

        it('should fetch more transactions when loadMoreTransactions is called', async () => {
            mockDispatch.mockReturnValue({
                unwrap: () => Promise.resolve([]),
            })

            const { result } = renderHookWithState(
                () =>
                    useTransactionHistoryList({
                        federationId: '1',
                        type: 'transactions',
                    }),
                store,
            )

            await waitFor(() => {
                expect(mockDispatch).toHaveBeenCalledTimes(1)
            })

            await result.current.loadMoreTransactions()

            expect(mockDispatch).toHaveBeenCalledTimes(2)
        })

        it('should call onError when fetching transactions fails', async () => {
            const onError = jest.fn()
            const error = new Error('failed to fetch transactions')
            mockDispatch.mockReturnValue({
                unwrap: () => Promise.reject(error),
            })

            renderHookWithState(
                () =>
                    useTransactionHistoryList({
                        federationId: '1',
                        type: 'transactions',
                        onError,
                    }),
                store,
            )

            await waitFor(() => {
                expect(onError).toHaveBeenCalledWith(error)
            })
        })

        it('should not call onError when loading more transactions fails', async () => {
            const onError = jest.fn()
            const error = new Error('failed to load more transactions')
            mockDispatch
                .mockReturnValueOnce({
                    unwrap: () => Promise.resolve([]),
                })
                .mockReturnValueOnce({
                    unwrap: () => Promise.reject(error),
                })

            const { result } = renderHookWithState(
                () =>
                    useTransactionHistoryList({
                        federationId: '1',
                        type: 'transactions',
                        onError,
                    }),
                store,
            )

            await waitFor(() => {
                expect(mockDispatch).toHaveBeenCalledTimes(1)
            })

            await expect(
                result.current.loadMoreTransactions(),
            ).resolves.toEqual([])

            expect(onError).not.toHaveBeenCalled()
        })

        it('should call onLoadMoreError when loading more transactions fails', async () => {
            const onLoadMoreError = jest.fn()
            const error = new Error('failed to load more transactions')
            mockDispatch
                .mockReturnValueOnce({
                    unwrap: () => Promise.resolve([]),
                })
                .mockReturnValueOnce({
                    unwrap: () => Promise.reject(error),
                })

            const { result } = renderHookWithState(
                () =>
                    useTransactionHistoryList({
                        federationId: '1',
                        type: 'transactions',
                        onLoadMoreError,
                    }),
                store,
            )

            await waitFor(() => {
                expect(mockDispatch).toHaveBeenCalledTimes(1)
            })

            await expect(
                result.current.loadMoreTransactions(),
            ).resolves.toEqual([])

            expect(onLoadMoreError).toHaveBeenCalledWith(error)
        })
    })

    describe('useTxnDisplayUtils', () => {
        const txn = createMockTransaction({
            amount: 100000,
        }) as TransactionListEntry

        describe('When a returned hook function is called', () => {
            it('should call corresponding util function', async () => {
                // Create spys for each util function
                const makeTxnFeeDetailsSpy = jest.spyOn(
                    walletUtils,
                    'makeTxnFeeDetails',
                )
                const makeTxnDetailItemsSpy = jest
                    .spyOn(walletUtils, 'makeTxnDetailItems')
                    .mockReturnValue([])
                const makeTxnAmountTextSpy = jest
                    .spyOn(walletUtils, 'makeTxnAmountText')
                    .mockReturnValue('')
                const makeStabilityTxnFeeDetailsSpy = jest
                    .spyOn(walletUtils, 'makeStabilityTxnFeeDetails')
                    .mockReturnValue([])
                const makeStabilityTxnDetailItemsSpy = jest
                    .spyOn(walletUtils, 'makeStabilityTxnDetailItems')
                    .mockReturnValue([])
                const makeTxnTypeTextSpy = jest
                    .spyOn(walletUtils, 'makeTxnTypeText')
                    .mockReturnValue('')
                const makeTxnStatusTextSpy = jest
                    .spyOn(walletUtils, 'makeTxnStatusText')
                    .mockReturnValue('')
                const makeTxnDetailTitleTextSpy = jest
                    .spyOn(walletUtils, 'makeTxnDetailTitleText')
                    .mockReturnValue('')

                const { result } = renderHookWithState(
                    () => useTxnDisplayUtils(t, '1', true),
                    store,
                )

                // Call hook functions
                const response = result.current.getCurrencyText(txn)
                expect(response).toBe('USD')

                result.current.makeTxnFeeDetailItems(txn)
                expect(makeTxnFeeDetailsSpy).toHaveBeenCalled()

                result.current.makeTxnDetailItems(txn)
                expect(makeTxnDetailItemsSpy).toHaveBeenCalled()

                result.current.makeTxnAmountText(txn)
                expect(makeTxnAmountTextSpy).toHaveBeenCalled()

                result.current.makeStabilityTxnFeeDetailItems(txn)
                expect(makeStabilityTxnFeeDetailsSpy).toHaveBeenCalled()

                result.current.makeStabilityTxnDetailItems(txn)
                expect(makeStabilityTxnDetailItemsSpy).toHaveBeenCalled()

                result.current.makeTxnTypeText(txn)
                expect(makeTxnTypeTextSpy).toHaveBeenCalled()

                result.current.makeTxnStatusText(txn)
                expect(makeTxnStatusTextSpy).toHaveBeenCalled()

                result.current.makeTxnDetailTitleText(txn)
                expect(makeTxnDetailTitleTextSpy).toHaveBeenCalled()
            })
        })
    })
})
