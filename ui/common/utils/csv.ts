import { TFunction } from 'i18next'

import { AmountSymbolPosition, FormattedAmounts } from '../hooks/amount'
import { MSats, Transaction } from '../types'
import { makeTxnDetailStatusText } from './wallet'

type CSVColumns<T> = { name: string; getValue: (item: T) => string | number }[]

const getTxType = (tx: Transaction) => {
    if (tx.bitcoin) return 'on-chain'
    if (tx.lightning) return 'lightning'
    if (tx.stabilityPoolState) return 'stability-pool'
    if (tx.oobState) return 'ecash'
    return 'unknown'
}

export function makeTransactionHistoryCSV(
    txs: Transaction[],
    makeFormattedAmountsFromMSats: (
        amount: MSats,
        symbolPosition: AmountSymbolPosition,
    ) => FormattedAmounts,
    t: TFunction,
) {
    const sortedTxs = txs.sort((a, b) => a.createdAt - b.createdAt)

    return makeCSV(sortedTxs, [
        {
            name: 'ID',
            getValue: tx => tx.id,
        },
        {
            name: 'Created at',
            getValue: tx => new Date(tx.createdAt * 1000).toISOString(),
        },
        {
            name: 'Direction',
            getValue: tx => tx.direction,
        },
        {
            name: 'Type',
            getValue: tx => getTxType(tx),
        },
        {
            name: 'Amount (fiat)',
            getValue: tx =>
                makeFormattedAmountsFromMSats(tx.amount, 'end').formattedFiat,
        },
        {
            name: 'Amount (sats)',
            getValue: tx => Math.round(tx.amount / 1000),
        },
        {
            name: 'Notes',
            getValue: tx => tx.notes,
        },
        {
            name: 'Status',
            getValue: tx => makeTxnDetailStatusText(t, tx),
        },
    ])
}

/**
 * Given a list of items and column definitions, make a multi-line CSV string.
 */
function makeCSV<T>(items: T[], columns: CSVColumns<T>): string {
    let csv = columns.map(column => column.name).join(',')
    items.forEach(item => {
        csv += `\r\n`
        columns.forEach((column, idx) => {
            if (idx !== 0) csv += ','
            // Wrap the value in quotes and escape any quotes inside the value.
            // Otherwise, commas and quotes will break the CSV.
            csv += `"${String(column.getValue(item)).replace(/"/g, '""')}"`
        })
    })
    return csv
}

/**
 * Given a string CSV, convert it to a base64 data URI.
 */
export function makeBase64CSVUri(csv: string) {
    return `data:text/csv;base64,${Buffer.from(csv, 'utf8').toString('base64')}`
}

/**
 * Given a string, convert it to something that can be used as a filename.
 * E.g. "My federation name" -> "my-federation-name.csv"
 */
export function makeCSVFilename(name: string) {
    return `${name
        .toLowerCase()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '')}.csv`
}
