import { TFunction } from 'i18next'
import { useCallback } from 'react'

import {
    makeTxnAmountText as makeTxnAmountTextUtil,
    makeTxnDetailItems as makeTxnDetailItemsUtil,
    makeTxnFeeDetails as makeTxnFeeDetailsUtil,
    makeTxnNotesText as makeTxnNotesTextUtil,
    makeStabilityTxnAmountText as makeStabilityTxnAmountTextUtil,
    makeStabilityTxnDetailItems as makeStabilityTxnDetailItemsUtil,
    makeStabilityTxnFeeDetails as makeStabilityTxnFeeDetailsUtil,
} from '@fedi/common/utils/wallet'

import {
    selectActiveFederationId,
    selectCurrency,
    selectEcashFeeSchedule,
    selectMaximumAPR,
    selectShowFiatTxnAmounts,
    selectStabilityPoolFeeSchedule,
} from '../redux'
import {
    fetchTransactions as reduxFetchTransactions,
    selectTransactionHistory,
    selectStabilityTransactionHistory,
} from '../redux/transactions'
import { Federation, MSats, Sats, Transaction } from '../types'
import { RpcFeeDetails } from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    makeBase64CSVUri,
    makeCSVFilename,
    makeTransactionHistoryCSV,
} from '../utils/csv'
import { FedimintBridge } from '../utils/fedimint'
import { useAmountFormatter, useBtcFiatPrice } from './amount'
import { useCommonDispatch, useCommonSelector } from './redux'

export function useTransactionHistory(fedimint: FedimintBridge) {
    const dispatch = useCommonDispatch()
    const activeFederationId = useCommonSelector(selectActiveFederationId)
    const transactions = useCommonSelector(selectTransactionHistory)
    const stabilityPoolTxns = useCommonSelector(
        selectStabilityTransactionHistory,
    )

    const fetchTransactions = useCallback(
        async (
            args?: Pick<
                Parameters<typeof reduxFetchTransactions>[0],
                'limit' | 'more' | 'refresh'
            >,
        ) => {
            if (!activeFederationId) throw new Error('errors.unknown-error')
            return dispatch(
                reduxFetchTransactions({
                    federationId: activeFederationId,
                    fedimint,
                    ...args,
                }),
            ).unwrap()
        },
        [activeFederationId, dispatch, fedimint],
    )

    return {
        transactions,
        stabilityPoolTxns,
        fetchTransactions,
    }
}

export function useTxnDisplayUtils(t: TFunction) {
    const { convertCentsToFormattedFiat } = useBtcFiatPrice()
    const selectedCurrency = useCommonSelector(selectCurrency)
    const showFiatTxnAmounts = useCommonSelector(selectShowFiatTxnAmounts)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const preferredCurrency = showFiatTxnAmounts
        ? selectedCurrency
        : t('words.sats').toUpperCase()

    const makeTxnFeeDetailItems = useCallback(
        (txn: Transaction) => {
            return makeTxnFeeDetailsUtil(t, txn, makeFormattedAmountsFromMSats)
        },
        [makeFormattedAmountsFromMSats, t],
    )

    const makeTxnDetailAmountText = useCallback(
        (txn: Transaction) => {
            return `${makeTxnAmountTextUtil(
                txn,
                showFiatTxnAmounts,
                makeFormattedAmountsFromMSats,
                convertCentsToFormattedFiat,
            )} ${preferredCurrency}`
        },
        [
            convertCentsToFormattedFiat,
            makeFormattedAmountsFromMSats,
            preferredCurrency,
            showFiatTxnAmounts,
        ],
    )

    const makeTxnDetailItems = useCallback(
        (txn: Transaction) => {
            return makeTxnDetailItemsUtil(
                t,
                txn,
                selectedCurrency,
                showFiatTxnAmounts,
                makeFormattedAmountsFromMSats,
                convertCentsToFormattedFiat,
            )
        },
        [
            convertCentsToFormattedFiat,
            makeFormattedAmountsFromMSats,
            selectedCurrency,
            showFiatTxnAmounts,
            t,
        ],
    )

    const makeTxnAmountText = useCallback(
        (txn: Transaction) => {
            return makeTxnAmountTextUtil(
                txn,
                showFiatTxnAmounts,
                makeFormattedAmountsFromMSats,
                convertCentsToFormattedFiat,
            )
        },
        [
            convertCentsToFormattedFiat,
            makeFormattedAmountsFromMSats,
            showFiatTxnAmounts,
        ],
    )

    const makeTxnNotesText = useCallback(
        (txn: Transaction) => {
            return makeTxnNotesTextUtil(t, txn, selectedCurrency)
        },
        [selectedCurrency, t],
    )

    const makeStabilityTxnAmountText = useCallback(
        (txn: Transaction) => {
            return makeStabilityTxnAmountTextUtil(
                t,
                txn,
                true,
                makeFormattedAmountsFromMSats,
                convertCentsToFormattedFiat,
            )
        },
        [convertCentsToFormattedFiat, makeFormattedAmountsFromMSats, t],
    )

    const makeStabilityTxnDetailAmountText = useCallback(
        (txn: Transaction) => {
            return `${makeStabilityTxnAmountTextUtil(
                t,
                txn,
                true,
                makeFormattedAmountsFromMSats,
                convertCentsToFormattedFiat,
            )} ${selectedCurrency}`
        },
        [
            convertCentsToFormattedFiat,
            makeFormattedAmountsFromMSats,
            selectedCurrency,
            t,
        ],
    )

    const makeStabilityTxnFeeDetailItems = useCallback(
        (txn: Transaction) => {
            return makeStabilityTxnFeeDetailsUtil(
                t,
                txn,
                makeFormattedAmountsFromMSats,
            )
        },
        [makeFormattedAmountsFromMSats, t],
    )

    const makeStabilityTxnDetailItems = useCallback(
        (txn: Transaction) => {
            return makeStabilityTxnDetailItemsUtil(
                t,
                txn,
                makeFormattedAmountsFromMSats,
            )
        },
        [makeFormattedAmountsFromMSats, t],
    )

    return {
        preferredCurrency,
        makeTxnDetailAmountText,
        makeTxnDetailItems,
        makeTxnFeeDetailItems,
        makeTxnAmountText,
        makeTxnNotesText,
        makeStabilityTxnAmountText,
        makeStabilityTxnDetailAmountText,
        makeStabilityTxnFeeDetailItems,
        makeStabilityTxnDetailItems,
    }
}

export function useExportTransactions(fedimint: FedimintBridge) {
    const { fetchTransactions } = useTransactionHistory(fedimint)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const exportTransactions = useCallback(async (federation: Federation): Promise<
        | { success: true; uri: string; fileName: string }
        | { success: false; message: string }
    > => {
        let transactions: Array<Transaction> = []

        try {
            transactions = await fetchTransactions({
                // TODO: find a better way than a hardcoded value
                limit: 10000,
            })

            const fileName = makeCSVFilename(
                federation?.name
                    ? 'transactions-' + federation?.name
                    : 'transactions',
            )
            const uri = makeBase64CSVUri(
                makeTransactionHistoryCSV(
                    transactions,
                    makeFormattedAmountsFromMSats,
                ),
            )

            return {
                success: true,
                uri,
                fileName,
            }
        } catch (e) {
            return {
                success: false,
                message: (e as Error).message,
            }
        }
    }, [fetchTransactions, makeFormattedAmountsFromMSats])

    return exportTransactions
}
export type FeeDetails = {
    items: FeeItem[]
    totalFee: MSats
}

export type FeeItem = {
    label: string
    formattedAmount: string
}

// Ecash fees are ppm values specified in the federations feeSchedule so we calculate
// the fee from the amount and provide all formatted UI display content
export function useFeeDisplayUtils(t: TFunction) {
    const maxFeeRate = useCommonSelector(selectMaximumAPR)
    const ecashFeeSchedule = useCommonSelector(selectEcashFeeSchedule)
    const stabilityPoolFeeSchedule = useCommonSelector(
        selectStabilityPoolFeeSchedule,
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const makeEcashFeeContent = (amount: MSats) => {
        let fediFee: MSats = 0 as MSats
        let federationFee: MSats = 0 as MSats
        // Fedi fee for sending ecash is calculated from the federation fee schedule
        if (ecashFeeSchedule) {
            fediFee = (amount * (ecashFeeSchedule.sendPpm / 1000000)) as MSats
            // Federation fee is hard-coded to 0 sats for now
            // TODO: fetch this from bridge
            federationFee = 0 as MSats
        }
        const totalFees: MSats = (fediFee + federationFee) as MSats

        const {
            formattedPrimaryAmount: formattedFediFee,
            formattedSecondaryAmount: formattedFediFeeSecondary,
        } = makeFormattedAmountsFromMSats(fediFee)
        const {
            formattedPrimaryAmount: formattedFederationFee,
            formattedSecondaryAmount: formattedFederationFeeSecondary,
        } = makeFormattedAmountsFromMSats(federationFee)
        const { formattedPrimaryAmount: formattedTotalFee } =
            makeFormattedAmountsFromMSats(totalFees)

        const ecashFeeItems: FeeItem[] = [
            {
                label: t('phrases.fedi-fee'),
                formattedAmount: `${formattedFediFee} (${formattedFediFeeSecondary})`,
            },
            {
                label: t('phrases.federation-fee'),
                formattedAmount: `${formattedFederationFee} (${formattedFederationFeeSecondary})`,
            },
        ]

        return {
            feeItemsBreakdown: ecashFeeItems,
            formattedTotalFee: `${
                totalFees > 0 ? '+' : ''
            }${formattedTotalFee}`,
        }
    }

    const makeLightningFeeContent = (feeDetails: RpcFeeDetails) => {
        const { fediFee, federationFee, networkFee } = feeDetails
        // prettier-ignore
        const lightningSendTotalFeeMsats = (
            fediFee + federationFee + networkFee
        ) as MSats

        // Format fedi fee
        const {
            formattedPrimaryAmount: formattedFediFee,
            formattedSecondaryAmount: formattedFediFeeSecondary,
        } = makeFormattedAmountsFromMSats(fediFee)
        const {
            formattedPrimaryAmount: formattedFederationFee,
            formattedSecondaryAmount: formattedFederationFeeSecondary,
        } = makeFormattedAmountsFromMSats(federationFee)
        const {
            formattedPrimaryAmount: formattedNetworkFee,
            formattedSecondaryAmount: formattedNetworkFeeSecondary,
        } = makeFormattedAmountsFromMSats(networkFee)
        const { formattedPrimaryAmount: formattedTotalFee } =
            makeFormattedAmountsFromMSats(lightningSendTotalFeeMsats)

        const lightningFeeItems: FeeItem[] = [
            {
                label: t('phrases.fedi-fee'),
                formattedAmount: `${formattedFediFee} (${formattedFediFeeSecondary})`,
            },
            {
                label: t('phrases.federation-fee'),
                formattedAmount: `${formattedFederationFee} (${formattedFederationFeeSecondary})`,
            },
            {
                label: t('phrases.lightning-network'),
                formattedAmount: `${formattedNetworkFee} (${formattedNetworkFeeSecondary})`,
            },
        ]

        return {
            feeItemsBreakdown: lightningFeeItems,
            formattedTotalFee: `${
                lightningSendTotalFeeMsats > 0 ? '+' : ''
            }${formattedTotalFee}`,
        }
    }

    const makeOnchainFeeContent = (feeDetails: RpcFeeDetails) => {
        const { fediFee, federationFee, networkFee } = feeDetails
        // prettier-ignore
        const onchainSendTotalFeeMsats = (
            fediFee + federationFee + networkFee
        ) as MSats

        // Format fedi fee
        const {
            formattedPrimaryAmount: formattedFediFee,
            formattedSecondaryAmount: formattedFediFeeSecondary,
        } = makeFormattedAmountsFromMSats(fediFee)
        const {
            formattedPrimaryAmount: formattedNetworkFee,
            formattedSecondaryAmount: formattedNetworkFeeSecondary,
        } = makeFormattedAmountsFromMSats(networkFee)
        const { formattedPrimaryAmount: formattedTotalFee } =
            makeFormattedAmountsFromMSats(onchainSendTotalFeeMsats)

        const lightningFeeItems: FeeItem[] = [
            {
                label: t('phrases.fedi-fee'),
                formattedAmount: `${formattedFediFee} (${formattedFediFeeSecondary})`,
            },
            {
                label: t('phrases.network-fee'),
                formattedAmount: `${formattedNetworkFee} (${formattedNetworkFeeSecondary})`,
            },
        ]

        return {
            feeItemsBreakdown: lightningFeeItems,
            formattedTotalFee: `${
                onchainSendTotalFeeMsats > 0 ? '+' : ''
            }${formattedTotalFee}`,
        }
    }

    const makeStabilityPoolFeeContent = (amount: Sats) => {
        const amountMsats = amountUtils.satToMsat(amount)
        let fediFee: MSats = 0 as MSats
        let federationFee: MSats = 0 as MSats
        // Fedi fee for sending ecash is calculated from the federation fee schedule
        if (stabilityPoolFeeSchedule) {
            fediFee = (amountMsats *
                (stabilityPoolFeeSchedule.sendPpm / 1000000)) as MSats
            // Federation fee is hard-coded to 0 sats for now
            // TODO: fetch this from bridge
            federationFee = 0 as MSats
        }
        const totalFees: MSats = (fediFee + federationFee) as MSats

        const {
            formattedPrimaryAmount: formattedFediFee,
            formattedSecondaryAmount: formattedFediFeeSecondary,
        } = makeFormattedAmountsFromMSats(fediFee)
        const {
            formattedPrimaryAmount: formattedFederationFee,
            formattedSecondaryAmount: formattedFederationFeeSecondary,
        } = makeFormattedAmountsFromMSats(federationFee)
        const { formattedPrimaryAmount: formattedTotalFee } =
            makeFormattedAmountsFromMSats(totalFees)

        const ecashFeeItems: FeeItem[] = [
            {
                label: t('phrases.fedi-fee'),
                formattedAmount: `${formattedFediFee} (${formattedFediFeeSecondary})`,
            },
            {
                label: t('phrases.federation-fee'),
                formattedAmount: `${formattedFederationFee} (${formattedFederationFeeSecondary})`,
            },
            {
                label: `${t('phrases.yearly-fee')}*`,
                formattedAmount: `${maxFeeRate}% max`,
            },
        ]

        return {
            feeItemsBreakdown: ecashFeeItems,
            formattedTotalFee: `${formattedTotalFee} + ${maxFeeRate}% yearly`,
        }
    }

    const feeBreakdownTitle = t('phrases.fee-details')
    const ecashFeesGuidanceText = t('feature.fees.guidance-ecash')

    return {
        feeBreakdownTitle,
        ecashFeesGuidanceText,
        makeEcashFeeContent,
        makeLightningFeeContent,
        makeOnchainFeeContent,
        makeStabilityPoolFeeContent,
    }
}
