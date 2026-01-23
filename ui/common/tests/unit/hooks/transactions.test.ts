import {
    useMultispendTxnDisplayUtils,
    useTransactionHistory,
    useTxnDisplayUtils,
} from '@fedi/common/hooks/transactions'
import { setupStore, setFederations } from '@fedi/common/redux'
import { setMatrixRoomMultispendStatus } from '@fedi/common/redux/matrix'
import { mockFederation1 } from '@fedi/common/tests/mock-data/federation'
import { TransactionListEntry } from '@fedi/common/types'
import { RpcMultispendGroupStatus } from '@fedi/common/types/bindings'

import * as walletUtils from '../../../utils/transaction'
import {
    createMockTransaction,
    createMockMultispendTransaction,
} from '../../mock-data/transactions'
import { renderHookWithState } from '../../utils/render'
import { createMockT } from '../../utils/setup'

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
        const txn = createMockMultispendTransaction()

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
                const makeStabilityTxnDetailTitleTextSpy = jest
                    .spyOn(walletUtils, 'makeStabilityTxnDetailTitleText')
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

                result.current.makeStabilityTxnDetailTitleText(txn)
                expect(makeStabilityTxnDetailTitleTextSpy).toHaveBeenCalled()
            })
        })
    })
})
