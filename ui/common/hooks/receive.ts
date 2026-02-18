import { ResultAsync } from 'neverthrow'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
    refreshLnurlReceive,
    selectLnurlReceiveCode,
    selectSupportsRecurringdLnurl,
} from '../redux'
import { ParsedLnurlWithdraw, Sats, TransactionListEntry } from '../types'
import amountUtils from '../utils/AmountUtils'
import { TaggedError } from '../utils/errors'
import { lnurlWithdraw } from '../utils/lnurl'
import { makeLog } from '../utils/log'
import { useFedimint } from './fedimint'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useTransactionHistory } from './transactions'

const log = makeLog('common/hooks/lightning')

type LnReceiveTxn = Extract<TransactionListEntry, { kind: 'lnReceive' }>

/**
 * Handles the logic for creating and subscribing to a lightning request.
 *
 * Exposes the necessary state variables/options to handle error/loading states.
 */
export const useMakeLightningRequest = ({
    federationId,
    onInvoicePaid,
}: {
    federationId: string | undefined
    onInvoicePaid?: (transaction: LnReceiveTxn) => void
}) => {
    const [invoice, setInvoice] = useState<string | null>(null)
    const [isInvoiceLoading, setIsInvoiceLoading] = useState<boolean>(false)

    const fedimint = useFedimint()

    const reset = useCallback(() => {
        setInvoice(null)
        setIsInvoiceLoading(false)
    }, [])

    const makeLightningRequest = useCallback(
        async (amount: Sats, memo: string = '') => {
            if (!federationId) return
            setIsInvoiceLoading(true)
            try {
                const inv = await fedimint.generateInvoice(
                    amountUtils.satToMsat(amount),
                    memo,
                    federationId,
                    null,
                    {
                        initialNotes: memo || null,
                        recipientMatrixId: null,
                        senderMatrixId: null,
                    },
                )

                setInvoice(inv)

                return inv
            } catch (e) {
                log.error('Failed to make lightning request', e)
                throw e
            } finally {
                setIsInvoiceLoading(false)
            }
        },
        [federationId, fedimint],
    )

    useEffect(() => {
        if (!invoice || !onInvoicePaid) return

        const unsubscribe = fedimint.addListener('transaction', event => {
            if (
                event.transaction.kind === 'lnReceive' &&
                event.transaction.ln_invoice === invoice
            ) {
                onInvoicePaid?.(event.transaction as LnReceiveTxn)
            }
        })

        return unsubscribe
    }, [invoice, fedimint, onInvoicePaid])

    return {
        makeLightningRequest,
        invoice,
        isInvoiceLoading,
        reset,
    }
}

type OnchainDepositTxn = Extract<
    TransactionListEntry,
    { kind: 'onchainDeposit' }
>

/**
 * Handles the logic for creating an onchain address and subscribing to a mempool transaction for that address.
 *
 * Exposes the necessary state variables/options to handle error/loading states and add transaction notes.
 */
export const useMakeOnchainAddress = ({
    federationId,
    onMempoolTransaction,
}: {
    federationId: string | undefined
    onMempoolTransaction?: (txn: OnchainDepositTxn) => void
}) => {
    const [address, setAddress] = useState<string | null>(null)
    const [isAddressLoading, setIsAddressLoading] = useState<boolean>(false)
    const fedimint = useFedimint()

    const { transactions, fetchTransactions } = useTransactionHistory(
        federationId || '',
    )

    const transaction = useMemo(
        () =>
            transactions.find(
                tx =>
                    tx.kind === 'onchainDeposit' &&
                    tx.onchain_address === address,
            ) as OnchainDepositTxn | undefined,
        [transactions, address],
    )

    const reset = useCallback(() => {
        setAddress(null)
        setIsAddressLoading(false)
    }, [])

    const makeOnchainAddress = useCallback(async () => {
        if (!federationId) return null

        setIsAddressLoading(true)
        try {
            const newAddress = await fedimint.generateAddress(federationId, {
                initialNotes: null,
                recipientMatrixId: null,
                senderMatrixId: null,
            })
            setAddress(newAddress)

            // Fetches transactionId of new address, in case the user updates notes
            await fetchTransactions()

            return newAddress
        } catch (e) {
            log.error('error generating address', e)
            throw e
        } finally {
            setIsAddressLoading(false)
        }
    }, [federationId, fedimint, fetchTransactions])

    const onSaveNotes = useCallback(
        async (notes: string) => {
            if (!transaction || !federationId) return

            try {
                await fedimint.updateTransactionNotes(
                    transaction.id,
                    notes,
                    federationId,
                )
            } catch (e) {
                log.error(
                    `Failed to update notes for transaction ${transaction.id}`,
                    e,
                )
                throw e
            }
        },
        [federationId, transaction, fedimint],
    )

    useEffect(() => {
        if (!address || !onMempoolTransaction) return

        const unsubscribe = fedimint.addListener('transaction', event => {
            if (
                event.transaction.kind === 'onchainDeposit' &&
                event.transaction.onchain_address === address
            ) {
                onMempoolTransaction?.(event.transaction as OnchainDepositTxn)
            }
        })

        return unsubscribe
    }, [fedimint, onMempoolTransaction, address])

    return {
        address,
        isAddressLoading,
        makeOnchainAddress,
        transaction,
        onSaveNotes,
        reset,
    }
}

/**
 * Handles withdrawing and subscribing to the completion of an LNURL Withdrawal.
 *
 * Exposes the necessary state variables and options for handling error and loading states.
 */
export function useLnurlWithdraw({
    federationId,
    lnurlw,
    onWithdrawPaid,
}: {
    federationId: string | undefined
    lnurlw: ParsedLnurlWithdraw | undefined
    onWithdrawPaid?: (txn: LnReceiveTxn) => void
}) {
    const [isWithdrawing, setIsWithdrawing] = useState(false)

    const fedimint = useFedimint()
    const reset = () => {
        setIsWithdrawing(false)
    }

    const waitForLnurlTransaction = useCallback(
        (invoice: string) => {
            return new Promise<LnReceiveTxn>((resolve, reject) => {
                const unsubscribe = fedimint.addListener(
                    'transaction',
                    event => {
                        if (
                            event.transaction.kind === 'lnReceive' &&
                            event.transaction.ln_invoice === invoice
                        ) {
                            unsubscribe()
                            resolve(event.transaction as LnReceiveTxn)
                        }
                    },
                )

                setTimeout(() => {
                    unsubscribe()
                    reject(
                        new Error(
                            'LNURL withdrawal timed out after 5000ms, aborting',
                        ),
                    )
                }, 5000)
            })
        },
        [fedimint],
    )

    const handleWithdraw = useCallback(
        async (amount: Sats, memo: string = '') => {
            if (!federationId || !lnurlw) return

            setIsWithdrawing(true)

            await lnurlWithdraw(
                fedimint,
                federationId,
                lnurlw.data,
                amountUtils.satToMsat(amount),
                memo,
            )
                .andThen(invoice =>
                    ResultAsync.fromPromise(
                        waitForLnurlTransaction(invoice),
                        e => new TaggedError('TimeoutError', e),
                    ),
                )
                .match(
                    txn => {
                        onWithdrawPaid?.(txn)
                    },
                    e => {
                        log.error(`Failed to complete LNURL Withdrawal`, e)
                        // TODO: do not throw
                        throw e
                    },
                )
            setIsWithdrawing(false)
        },
        [
            federationId,
            fedimint,
            lnurlw,
            waitForLnurlTransaction,
            onWithdrawPaid,
        ],
    )

    return {
        reset,
        handleWithdraw,
        isWithdrawing,
    }
}

export function useLnurlReceiveCode(federationId: string) {
    const supportsLnurl = useCommonSelector(s =>
        selectSupportsRecurringdLnurl(s, federationId),
    )
    const lnurlReceiveCode = useCommonSelector(s =>
        selectLnurlReceiveCode(s, federationId),
    )
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()
    const [isFetching, setIsFetching] = useState(false)

    useEffect(() => {
        if (supportsLnurl === false || !federationId) return

        setIsFetching(true)
        dispatch(refreshLnurlReceive({ fedimint, federationId }))
            .unwrap()
            .catch(e => log.error('Failed to refresh lnurl receive code', e))
            .finally(() => {
                setIsFetching(false)
            })
    }, [fedimint, federationId, supportsLnurl, dispatch])

    return {
        isLoading: isFetching,
        lnurlReceiveCode,
        supportsLnurl,
    }
}
