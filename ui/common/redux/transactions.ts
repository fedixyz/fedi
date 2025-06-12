import {
    PayloadAction,
    createAsyncThunk,
    createSelector,
    createSlice,
} from '@reduxjs/toolkit'
import orderBy from 'lodash/orderBy'

import { CommonState } from '.'
import { Federation, Transaction, TransactionListEntry } from '../types'
import { FedimintBridge } from '../utils/fedimint'

type FederationPayloadAction<T = object> = PayloadAction<
    { federationId: string } & T
>

/*** Initial State ***/

const initialTransactionsState = {
    transactions: [] as TransactionListEntry[],
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
) => state[federationId] || { ...initialTransactionsState }

/**
 * Given a list of new transactions and optionally the old ones, return a
 * combined list that has been sorted and deduplicated.
 *
 * TODO: maintain createdAt Timestamp for updates... only modify updated fields
 * for existing transactions
 */
const updateTransactions = (
    newTransactions: TransactionListEntry[],
    oldTransactions: TransactionListEntry[] = [],
) => {
    // Use a Map for O(1) lookups during deduplication
    // The Map preserves insertion order, with newer transactions added first
    const transactionMap = new Map<string, TransactionListEntry>()

    for (const tx of newTransactions) {
        transactionMap.set(tx.id, tx)
    }

    // Add old transactions only if they don't already exist in the map
    for (const tx of oldTransactions) {
        if (!transactionMap.has(tx.id)) {
            transactionMap.set(tx.id, tx)
        }
    }

    const transactions = Array.from(transactionMap.values())

    // Sort list in descending order of when the transaction was created
    return orderBy(transactions, 'createdAt', 'desc')
}

const updateSingleTransaction = (
    transaction: Transaction,
    oldTransactions: TransactionListEntry[] = [],
) => {
    return oldTransactions.map(t =>
        t.id === transaction.id ? { ...t, ...transaction } : t,
    )
}

export const transactionsSlice = createSlice({
    name: 'transactions',
    initialState,
    reducers: {
        updateTransaction(
            state,
            action: FederationPayloadAction<{
                transaction: Transaction
            }>,
        ) {
            const { federationId, transaction } = action.payload
            const fedTxState = getFederationTxsState(state, federationId)
            const transactions = updateSingleTransaction(
                transaction,
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
                [{ ...existingTransaction, txnNotes: notes }],
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

export const { updateTransaction } = transactionsSlice.actions

/*** Async thunk actions ***/

export const fetchTransactions = createAsyncThunk<
    TransactionListEntry[],
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
    async (
        { fedimint, federationId, limit = 100, more },
        { getState, dispatch },
    ) => {
        const { transactions: cachedTransactions } = getFederationTxsState(
            getState().transactions,
            federationId,
        )
        const paginationTimestamp = more
            ? cachedTransactions[cachedTransactions.length - 1]?.createdAt ||
              undefined
            : undefined

        const transactions = await fedimint.listTransactions(
            federationId,
            paginationTimestamp,
            limit,
        )

        transactions.forEach(txn => {
            // TODO: figure out how to determine if someone DELETED their notes.
            // For now, we'll "reset" the txnNotes to initialNotes if it's missing.
            if (txn.frontendMetadata.initialNotes && !txn.txnNotes) {
                dispatch(
                    updateTransactionNotes({
                        fedimint,
                        federationId,
                        transactionId: txn.id,
                        notes: txn.frontendMetadata.initialNotes,
                    }),
                )
            }
        })
        return transactions
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

export const selectStabilityTransactionHistory = createSelector(
    selectTransactions,
    transactions =>
        transactions.filter(txn => {
            return (
                txn.kind === 'spDeposit' ||
                txn.kind === 'spWithdraw' ||
                txn.kind === 'sPV2Deposit' ||
                txn.kind === 'sPV2Withdrawal' ||
                txn.kind === 'sPV2TransferOut' ||
                txn.kind === 'sPV2TransferIn'
            )
        }),
)
