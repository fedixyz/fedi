import { TFunction } from 'i18next'
import { useCallback } from 'react'

import {
    makeStabilityTxnDetailItems as makeStabilityTxnDetailItemsUtil,
    makeStabilityTxnFeeDetails as makeStabilityTxnFeeDetailsUtil,
    makeTxnAmountText as makeTxnAmountTextUtil,
    makeTxnDetailItems as makeTxnDetailItemsUtil,
    makeTxnFeeDetails as makeTxnFeeDetailsUtil,
    makeTxnNotesText as makeTxnNotesTextUtil,
    makeTxnStatusText as makeTxnStatusTextUtil,
    makeTxnTypeText as makeTxnTypeTextUtil,
    makeTxnDetailTitleText as makeTxnDetailTitleTextUtil,
    makeStabilityTxnDetailTitleText as makeStabilityTxnDetailTitleTextUtil,
    makeMultispendTxnDetailItems as makeMultispendTxnDetailItemsUtil,
    makeTransactionAmountState,
} from '@fedi/common/utils/wallet'

import {
    selectActiveFederationId,
    selectCurrency,
    selectEcashFeeSchedule,
    selectFederationStabilityPoolConfig,
    selectMatrixRoomMembers,
    selectMatrixRoomMultispendStatus,
    selectShowFiatTxnAmounts,
    selectStabilityPoolAverageFeeRate,
    selectStabilityPoolFeeSchedule,
} from '../redux'
import {
    fetchTransactions as reduxFetchTransactions,
    selectStabilityTransactionHistory,
    selectTransactions,
} from '../redux/transactions'
import {
    LoadedFederation,
    MSats,
    MultispendTransactionListEntry,
    Sats,
    SupportedCurrency,
    TransactionListEntry,
    UsdCents,
} from '../types'
import { RpcFeeDetails, RpcRoomId } from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    makeBase64CSVUri,
    makeCSVFilename,
    makeTransactionHistoryCSV,
} from '../utils/csv'
import { FedimintBridge } from '../utils/fedimint'
import { getMultispendInvite } from '../utils/matrix'
import { useAmountFormatter, useBtcFiatPrice } from './amount'
import { useCommonDispatch, useCommonSelector } from './redux'

export function useTransactionHistory(fedimint: FedimintBridge) {
    const dispatch = useCommonDispatch()
    const activeFederationId = useCommonSelector(selectActiveFederationId)
    const transactions = useCommonSelector(selectTransactions)
    const stabilityPoolTxns = useCommonSelector(
        selectStabilityTransactionHistory,
    )

    const fetchTransactions = useCallback(
        async (
            args?: Pick<
                Parameters<typeof reduxFetchTransactions>[0],
                'limit' | 'more' | 'refresh'
            > & { federationId?: string },
        ) => {
            const federationId = args?.federationId ?? activeFederationId
            if (!federationId) return []
            return dispatch(
                reduxFetchTransactions({
                    federationId,
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

export function useTxnDisplayUtils(t: TFunction, isStabilityPool = false) {
    const { convertCentsToFormattedFiat, convertSatsToFormattedFiat } =
        useBtcFiatPrice()
    const selectedCurrency = useCommonSelector(selectCurrency)
    const showFiatTxnAmounts = useCommonSelector(selectShowFiatTxnAmounts)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const preferredCurrency = showFiatTxnAmounts
        ? selectedCurrency
        : t('words.sats').toUpperCase()

    const getCurrencyText = useCallback(
        (txn: TransactionListEntry): string =>
            showFiatTxnAmounts && txn.txDateFiatInfo
                ? txn.txDateFiatInfo.fiatCode
                : preferredCurrency,
        [preferredCurrency, showFiatTxnAmounts],
    )

    const makeTxnFeeDetailItems = useCallback(
        (txn: TransactionListEntry) => {
            return makeTxnFeeDetailsUtil(t, txn, makeFormattedAmountsFromMSats)
        },
        [makeFormattedAmountsFromMSats, t],
    )

    const makeTxnDetailItems = useCallback(
        (txn: TransactionListEntry) => {
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
        (txn: TransactionListEntry, includeCurrency = false) => {
            if (showFiatTxnAmounts && txn.txDateFiatInfo) {
                const sats = amountUtils.msatToSat(txn.amount)
                // Use the historical exchange rate from txDateFiatInfo:
                const formattedFiat = convertSatsToFormattedFiat(
                    sats,
                    'none', // or another symbolPosition if desired
                    txn.txDateFiatInfo,
                )
                // Optionally include the currency code from the transaction's historical info.
                const result = includeCurrency
                    ? `${formattedFiat} ${txn.txDateFiatInfo.fiatCode}`
                    : formattedFiat.split(' ')[0]
                return result
            } else {
                // Fallback to the existing conversion that uses the MSats-based helper.
                return `${makeTxnAmountTextUtil(
                    txn,
                    showFiatTxnAmounts,
                    isStabilityPool,
                    makeFormattedAmountsFromMSats, // Use the helper that expects an amount in MSats
                    convertCentsToFormattedFiat,
                )}${includeCurrency ? ` ${preferredCurrency}` : ''}`
            }
        },
        [
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
            isStabilityPool,
            makeFormattedAmountsFromMSats,
            preferredCurrency,
            showFiatTxnAmounts,
        ],
    )

    const makeTxnNotesText = useCallback((txn: TransactionListEntry) => {
        return makeTxnNotesTextUtil(txn)
    }, [])

    const makeStabilityTxnFeeDetailItems = useCallback(
        (txn: TransactionListEntry) => {
            return makeStabilityTxnFeeDetailsUtil(
                t,
                txn,
                makeFormattedAmountsFromMSats,
            )
        },
        [makeFormattedAmountsFromMSats, t],
    )

    const makeStabilityTxnDetailItems = useCallback(
        (txn: TransactionListEntry) => {
            return makeStabilityTxnDetailItemsUtil(
                t,
                txn,
                makeFormattedAmountsFromMSats,
            )
        },
        [makeFormattedAmountsFromMSats, t],
    )

    const makeTxnTypeText = useCallback(
        (txn: TransactionListEntry) => {
            return makeTxnTypeTextUtil(txn, t)
        },
        [t],
    )

    const makeTxnStatusText = useCallback(
        (txn: TransactionListEntry) => {
            return makeTxnStatusTextUtil(t, txn)
        },
        [t],
    )

    const makeTxnDetailTitleText = useCallback(
        (txn: TransactionListEntry) => {
            return makeTxnDetailTitleTextUtil(t, txn)
        },
        [t],
    )

    const makeStabilityTxnDetailTitleText = useCallback(
        (txn: TransactionListEntry) => {
            return makeStabilityTxnDetailTitleTextUtil(t, txn)
        },
        [t],
    )

    return {
        preferredCurrency,
        getCurrencyText,
        makeTxnDetailItems,
        makeTxnFeeDetailItems,
        makeTxnAmountText,
        makeTxnNotesText,
        makeStabilityTxnFeeDetailItems,
        makeStabilityTxnDetailItems,
        makeTxnTypeText,
        makeTxnStatusText,
        makeTxnDetailTitleText,
        makeStabilityTxnDetailTitleText,
    }
}

export function useMultispendTxnDisplayUtils(t: TFunction, roomId: RpcRoomId) {
    const { convertCentsToFormattedFiat } = useBtcFiatPrice()
    const selectedCurrency = useCommonSelector(selectCurrency)
    const showFiatTxnAmounts = useCommonSelector(selectShowFiatTxnAmounts)
    const preferredCurrency = showFiatTxnAmounts
        ? selectedCurrency
        : t('words.sats').toUpperCase()

    const multispendStatus = useCommonSelector(s =>
        selectMatrixRoomMultispendStatus(s, roomId),
    )
    const roomMembers = useCommonSelector(s =>
        selectMatrixRoomMembers(s, roomId),
    )

    const makeMultispendTxnStatusText = useCallback(
        (txn: MultispendTransactionListEntry) => {
            if (txn.state === 'invalid') return t('words.unknown')
            // group should always be finalized at this point
            if (!multispendStatus || multispendStatus.status !== 'finalized')
                return t('words.unknown')

            if ('depositNotification' in txn.event) return t('words.deposit')
            if ('withdrawalRequest' in txn.event) {
                const withdrawalRequest = txn.event.withdrawalRequest
                const invitation = getMultispendInvite(multispendStatus)
                // finalized multispends should always have an invitation
                if (!invitation) return t('words.unknown')

                if (withdrawalRequest.completed) {
                    return t('words.withdrawal')
                } else if (
                    withdrawalRequest.rejections.length >
                    invitation.signers.length - Number(invitation.threshold)
                ) {
                    return t('words.failed')
                } else {
                    return t('words.pending')
                }
            }
            return t('words.unknown')
        },
        [multispendStatus, t],
    )

    const makeMultispendTxnNotesText = useCallback(
        (txn: MultispendTransactionListEntry) => {
            if (txn.state === 'invalid') return t('words.unknown')
            if (txn.state === 'deposit') {
                return txn.event.depositNotification.description
            }
            if (txn.state === 'withdrawal') {
                return txn.event.withdrawalRequest.description
            }
            return t('words.unknown')
        },
        [t],
    )

    const makeMultispendTxnAmountText = useCallback(
        (txn: MultispendTransactionListEntry, includeCurrency = false) => {
            if (txn.state === 'invalid') {
                return '-'
            }
            if (txn.state === 'deposit') {
                const fiatAmount = txn.event.depositNotification
                    .fiatAmount as UsdCents
                return `${convertCentsToFormattedFiat(fiatAmount, 'none')}${includeCurrency ? ` ${preferredCurrency || SupportedCurrency.USD}` : ''}`
            }
            if (txn.state === 'withdrawal') {
                const fiatAmount = txn.event.withdrawalRequest.request
                    .transfer_amount as UsdCents
                return `${convertCentsToFormattedFiat(fiatAmount, 'none')}${includeCurrency ? ` ${preferredCurrency || SupportedCurrency.USD}` : ''}`
            }
            return '-'
        },
        [convertCentsToFormattedFiat, preferredCurrency],
    )

    const makeMultispendTxnCurrencyText = useCallback(() => {
        return preferredCurrency ?? SupportedCurrency.USD
    }, [preferredCurrency])

    const makeMultispendTxnTimestampText = useCallback(
        (txn: MultispendTransactionListEntry) => {
            return Number((txn.time / 1000).toFixed(0))
        },
        [],
    )

    const makeMultispendTxnAmountStateText = useCallback(
        (txn: MultispendTransactionListEntry) => {
            return makeTransactionAmountState(txn)
        },
        [],
    )

    const makeMultispendTxnDetailItems = useCallback(
        (txn: MultispendTransactionListEntry) => {
            return makeMultispendTxnDetailItemsUtil(
                t,
                txn,
                roomMembers,
                convertCentsToFormattedFiat,
            )
        },
        [convertCentsToFormattedFiat, roomMembers, t],
    )

    return {
        preferredCurrency,
        makeMultispendTxnStatusText,
        makeMultispendTxnNotesText,
        makeMultispendTxnAmountText,
        makeMultispendTxnCurrencyText,
        makeMultispendTxnTimestampText,
        makeMultispendTxnAmountStateText,
        makeMultispendTxnDetailItems,
    }
}

export function useExportTransactions(fedimint: FedimintBridge, t: TFunction) {
    const { fetchTransactions } = useTransactionHistory(fedimint)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()

    const exportTransactions = useCallback(
        async (
            federation: LoadedFederation,
        ): Promise<
            | { success: true; uri: string; fileName: string }
            | { success: false; message: string }
        > => {
            try {
                const transactions = await fetchTransactions({
                    // TODO: find a better way than a hardcoded value
                    limit: 10000,
                    federationId: federation.id,
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
                        t,
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
        },
        [fetchTransactions, makeFormattedAmountsFromMSats, t],
    )

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
    const ecashFeeSchedule = useCommonSelector(selectEcashFeeSchedule)
    const stabilityPoolFeeSchedule = useCommonSelector(
        selectStabilityPoolFeeSchedule,
    )
    const stabilityPoolAverageFeeRate = useCommonSelector(
        selectStabilityPoolAverageFeeRate,
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter()
    const stabilityConfig = useCommonSelector(
        selectFederationStabilityPoolConfig,
    )

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

        const onchainFeeItems: FeeItem[] = [
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
            feeItemsBreakdown: onchainFeeItems,
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

        const averageFeeRatePerCycle = stabilityPoolAverageFeeRate ?? 0
        // convert parts per billion to decimal
        const periodicRate = averageFeeRatePerCycle / 1_000_000_000
        // Calculate cycles per year based on cycle_duration + seconds in 1 year
        const secondsPerCycle = stabilityConfig?.cycle_duration.secs ?? 0
        const secondsInYear = 365 * 24 * 60 * 60
        const cyclesPerYear = secondsInYear / secondsPerCycle
        const compoundedAnnualRate =
            1 - Math.pow(1 - periodicRate, cyclesPerYear)
        const formattedFeeAverage = Number(
            (compoundedAnnualRate * 100).toFixed(2),
        )

        const stabilityFeeItems: FeeItem[] = [
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
                formattedAmount:
                    typeof stabilityPoolAverageFeeRate === 'number'
                        ? `${formattedFeeAverage}%`
                        : '-',
            },
        ]

        return {
            feeItemsBreakdown: stabilityFeeItems,
            formattedTotalFee:
                formattedFeeAverage > 0
                    ? `${formattedTotalFee} + ${formattedFeeAverage}% yearly`
                    : formattedTotalFee,
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
