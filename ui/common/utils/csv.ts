// csv.ts
import { TFunction } from 'i18next'

import { AmountSymbolPosition, FormattedAmounts } from '../hooks/amount'
import { MSats, TransactionListEntry } from '../types'
import amountUtils, { FIAT_MAX_DECIMAL_PLACES } from './AmountUtils'
import { getTxnDirection, makeTxnStatusText, makeTxnTypeText } from './wallet'

type CSVColumns<T> = { name: string; getValue: (item: T) => string | number }[]

/**
 * Generate a CSV string from a list of TransactionListEntry items.
 * If a transaction has txDateFiatInfo, we use the historical rate.
 * Otherwise, we fall back to the current logic in makeFormattedAmountsFromMSats.
 */
export function makeTransactionHistoryCSV(
    txs: TransactionListEntry[],
    makeFormattedAmountsFromMSats: (
        amount: MSats,
        symbolPosition: AmountSymbolPosition,
    ) => FormattedAmounts,
    t: TFunction,
): string {
    // Sort transactions by createdAt ascending
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
            getValue: tx => getTxnDirection(tx),
        },
        {
            name: 'Type',
            getValue: tx => makeTxnTypeText(tx, t),
        },
        {
            name: 'Amount (fiat)',
            getValue: tx => {
                if (tx.txDateFiatInfo) {
                    const historicalRate = amountUtils.getRateFromFiatFxInfo(
                        tx.txDateFiatInfo,
                    )
                    const btc = amountUtils.msatToBtc(tx.amount)
                    return (
                        amountUtils
                            .btcToFiat(btc, historicalRate)
                            .toFixed(FIAT_MAX_DECIMAL_PLACES) +
                        ` ${tx.txDateFiatInfo.fiatCode}`
                    )
                } else {
                    return makeFormattedAmountsFromMSats(tx.amount, 'end')
                        .formattedFiat
                }
            },
        },
        {
            name: 'Amount (sats)',
            getValue: tx => Math.round(tx.amount / 1000),
        },
        {
            name: 'Notes',
            getValue: tx => tx.txnNotes,
        },
        {
            name: 'Status',
            getValue: tx => makeTxnStatusText(t, tx),
        },
    ])
}

/**
 * Given a list of items and column definitions, make a multi-line CSV string.
 */
function makeCSV<T>(items: T[], columns: CSVColumns<T>): string {
    // Make header row
    let csv = columns.map(column => column.name).join(',')

    // Make data rows
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
 **/
export function makeCSVFilename(name: string) {
    return `${name
        .toLowerCase()
        .replace(/\s/g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '')}.csv`
}
