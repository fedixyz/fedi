import {
    PayloadAction,
    createAsyncThunk,
    createSelector,
    createSlice,
} from '@reduxjs/toolkit'
import orderBy from 'lodash/orderBy'

import { CommonState } from '.'
import { Federation, Transaction, TransactionDirection } from '../types'
import { FedimintBridge } from '../utils/fedimint'

type FederationPayloadAction<T = object> = PayloadAction<
    { federationId: string } & T
>

/*** Initial State ***/

const initialTransactionsState = {
    transactions: [] as Transaction[],
}
type FederationTransactionsState = typeof initialTransactionsState

// All transaction state is keyed by federation id to keep federation transactions separate, so it starts as an empty object.
const initialState = {} as Record<
    Federation['id'],
    FederationTransactionsState | undefined
>

export type TransactionsState = typeof initialState

/*** Slice definition ***/

const getFederationTxsState = (
    state: TransactionsState,
    federationId: string,
) =>
    state[federationId] || {
        ...initialTransactionsState,
    }

/**
 * Given a list of new transactions and optionally the old ones, return a
 * combined list that has been sorted and deduplicated.
 */
const updateTransactions = (
    newTransactions: Transaction[],
    oldTransactions: Transaction[] = [],
) => {
    // Combine lists with new transactions in the front
    let transactions = [...newTransactions, ...oldTransactions]

    // Deduplicate list, preferring newer transactions
    transactions = transactions.filter(
        (tx, i) => transactions.findIndex(t => t.id === tx.id) === i,
    )

    // Sort list in descending order of when the transaction was created
    return orderBy(transactions, 'createdAt', 'desc')
}

export const transactionsSlice = createSlice({
    name: 'transactions',
    initialState,
    reducers: {
        addTransaction(
            state,
            action: FederationPayloadAction<{ transaction: Transaction }>,
        ) {
            const { federationId, transaction } = action.payload
            const fedTxState = getFederationTxsState(state, federationId)
            const transactions = updateTransactions(
                [transaction],
                fedTxState.transactions,
            )
            return {
                ...state,
                [federationId]: {
                    ...fedTxState,
                    transactions,
                },
            }
        },
    },
    extraReducers: builder => {
        builder.addCase(fetchTransactions.fulfilled, (state, action) => {
            const { federationId, refresh } = action.meta.arg
            const fedTxState = getFederationTxsState(state, federationId)
            // If we are refreshing the list, don't include any old
            // transactions and start fresh
            const transactions = updateTransactions(
                action.payload,
                refresh ? undefined : fedTxState.transactions,
            )
            return {
                ...state,
                [federationId]: {
                    ...fedTxState,
                    transactions,
                },
            }
        })

        builder.addCase(updateTransactionNotes.fulfilled, (state, action) => {
            const { federationId, transactionId, notes } = action.meta.arg
            const fedTxState = getFederationTxsState(state, federationId)
            const existingTransaction = fedTxState.transactions.find(
                txn => txn.id === transactionId,
            )
            // If we don't find the existing transaction, no state update necessary
            if (!existingTransaction) return
            // Otherwise, update the notes field on the transaction
            const transactions = updateTransactions(
                [{ ...existingTransaction, notes }],
                fedTxState.transactions,
            )
            return {
                ...state,
                [federationId]: {
                    ...fedTxState,
                    transactions,
                },
            }
        })
    },
})

/*** Basic actions ***/

export const { addTransaction } = transactionsSlice.actions

/*** Async thunk actions ***/

export const fetchTransactions = createAsyncThunk<
    Transaction[],
    {
        fedimint: FedimintBridge
        federationId: string
        limit?: number
        more?: boolean
        refresh?: boolean
    },
    { state: CommonState }
>(
    'transactions/refreshTransactions',
    async ({ fedimint, federationId, limit = 100, more }, { getState }) => {
        const { transactions } = getFederationTxsState(
            getState().transactions,
            federationId,
        )
        const paginationTimestamp = more
            ? transactions[transactions.length - 1]?.createdAt || undefined
            : undefined
        return await fedimint.listTransactions(
            federationId,
            paginationTimestamp,
            limit,
        )
    },
)

export const updateTransactionNotes = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federationId: string
        transactionId: string
        notes: string
    }
>(
    'transactions/updateTransactionNotes',
    async ({ fedimint, federationId, transactionId, notes }) => {
        await fedimint.updateTransactionNotes(
            transactionId,
            notes,
            federationId,
        )
    },
)

/*** Selectors ***/

export const selectTransactions = (
    s: CommonState,
    federationId?: Federation['id'],
) =>
    getFederationTxsState(
        s.transactions,
        federationId || s.federation.activeFederationId || '',
    ).transactions

/**
 * Selects all transactions with any that should not be seen by users filtered out.
 */
export const selectTransactionHistory = createSelector(
    selectTransactions,
    transactions =>
        transactions.filter(txn => {
            // Filter out on-chain transactions older than 1 hour
            if (
                txn.bitcoin &&
                txn.direction === TransactionDirection.receive &&
                Date.now() / 1000 - txn.createdAt > 3600 &&
                (!txn.onchainState ||
                    (txn.onchainState.type !== 'waitingForConfirmation' &&
                        txn.onchainState.type !== 'confirmed' &&
                        txn.onchainState.type !== 'claimed'))
            ) {
                return false
            }
            return true
        }),
)

export const selectStabilityTransactionHistory = createSelector(
    selectTransactionHistory,
    transactions =>
        transactions.filter(txn => {
            if (txn.stabilityPoolState) {
                return true
            }
        }),
)
