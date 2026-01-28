// csv.ts
import { TFunction } from 'i18next'

import {
    MSats,
    TransactionListEntry,
    MultispendTransactionListEntry,
    UsdCents,
    SelectableCurrency,
    SupportedCurrency,
    MultispendFinalized,
    MultispendActiveInvitation,
    MatrixRoomMember,
    MatrixUser,
} from '../types'
import { AmountSymbolPosition, FormattedAmounts } from '../types/amount'
import { RpcTransactionListEntry } from '../types/bindings'
import amountUtils, { FIAT_MAX_DECIMAL_PLACES } from './AmountUtils'
import { findUserDisplayName } from './matrix'
import {
    getTxnDirection,
    makeMultispendTxnStatusText,
    makeTxnStatusText,
    makeTxnTypeText,
} from './transaction'

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
    // Create a separate line item for the deposit for refunded ecash payments
    const separatedTxns = extractDepositsFromRefunds(txs)

    // Sort transactions by createdAt ascending
    const sortedTxs = separatedTxns.sort((a, b) => a.createdAt - b.createdAt)

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
            getValue: tx => tx.txnNotes ?? '',
        },
        {
            name: 'Status',
            getValue: tx => makeTxnStatusText(t, tx),
        },
    ])
}

function extractDepositsFromRefunds(txs: TransactionListEntry[]) {
    return txs.flatMap(tx => {
        // Separate the refunded ecash payment from the ecash send
        if (
            tx.kind === 'oobSend' &&
            (tx.state?.type === 'refunded' ||
                tx.state?.type === 'userCanceledSuccess')
        ) {
            return [
                {
                    ...tx,
                    kind: 'oobSend',
                    state: {
                        type: 'success',
                    },
                },
                {
                    ...tx,
                    kind: 'oobSend',
                    // Outcome time tells us when the payment was refunded
                    createdAt: tx.outcomeTime ?? tx.createdAt,
                    state: {
                        type: 'refunded',
                    },
                },
            ] satisfies RpcTransactionListEntry[]
        } else {
            return [tx]
        }
    })
}

/**
 * Generate a CSV string from a list of MultispendTransactionListEntry items.
 */
export function makeMultispendTransactionHistoryCSV(
    txs: MultispendTransactionListEntry[],
    convertCentsToFormattedFiat: (
        amt: UsdCents,
        symbolPosition?: AmountSymbolPosition,
    ) => string,
    t: TFunction,
    preferredCurrency?: SelectableCurrency,
    multispendStatus?:
        | MultispendActiveInvitation
        | MultispendFinalized
        | undefined,
    roomMembers?: MatrixRoomMember[],
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
            // multispend txns are already in unix milliseconds, no need to x1000
            getValue: tx => new Date(tx.createdAt).toISOString(),
        },
        {
            name: 'Type',
            getValue: tx =>
                tx.state === 'withdrawal'
                    ? t('phrases.multispend-withdrawal')
                    : tx.state === 'deposit'
                      ? t('phrases.multispend-deposit')
                      : t('words.unknown'),
        },
        {
            name: 'Status',
            getValue: tx =>
                makeMultispendTxnStatusText(t, tx, multispendStatus, true),
        },
        {
            name: 'Amount (USD)',
            getValue: tx => {
                let amountCents: UsdCents | undefined
                if (tx.state === 'deposit') {
                    amountCents = tx.event.depositNotification
                        .fiatAmount as UsdCents
                }
                if (tx.state === 'withdrawal') {
                    amountCents = tx.event.withdrawalRequest.request
                        .transfer_amount as UsdCents
                }
                return amountCents
                    ? amountUtils.formatFiat(
                          amountCents / 100,
                          SupportedCurrency.USD,
                          {
                              symbolPosition: 'none',
                          },
                      )
                    : ''
            },
        },
        // only add a column for the preferred currency if it is different from USD
        ...(preferredCurrency && preferredCurrency !== 'USD'
            ? [
                  {
                      name: `Amount (${preferredCurrency})`,
                      getValue: (tx: MultispendTransactionListEntry) => {
                          let amountCents: UsdCents | undefined
                          if (tx.state === 'deposit') {
                              amountCents = tx.event.depositNotification
                                  .fiatAmount as UsdCents
                          }
                          if (tx.state === 'withdrawal') {
                              amountCents = tx.event.withdrawalRequest.request
                                  .transfer_amount as UsdCents
                          }
                          // conversion function should already have the correct rate + currency code
                          return amountCents
                              ? convertCentsToFormattedFiat(amountCents, 'none')
                              : ''
                      },
                  },
              ]
            : []),
        {
            name: 'Description',
            getValue: tx => {
                if (tx.state === 'deposit') {
                    return tx.event.depositNotification.description || ''
                }
                if (tx.state === 'withdrawal') {
                    return tx.event.withdrawalRequest.description || ''
                }
                return ''
            },
        },
        {
            name: 'Depositor / Withdrawer',
            getValue: tx => {
                let userId: MatrixUser['id'] | undefined
                if (tx.state === 'deposit') {
                    userId = tx.event.depositNotification.user
                }
                if (tx.state === 'withdrawal') {
                    userId = tx.event.withdrawalRequest.sender
                }
                return userId
                    ? findUserDisplayName(userId, roomMembers || [])
                    : ''
            },
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
