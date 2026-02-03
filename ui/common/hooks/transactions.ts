import { TFunction } from 'i18next'
import { useCallback, useContext } from 'react'

import { FedimintContext } from '../components/FedimintProvider'
import {
    fetchMultispendTransactions,
    selectCurrency,
    selectEcashFeeSchedule,
    selectFederationStabilityPoolConfig,
    selectMatrixRoomMembers,
    selectMatrixRoomMultispendStatus,
    selectTransactionDisplayType,
    selectStabilityPoolAverageFeeRate,
    selectStabilityPoolFeeSchedule,
} from '../redux'
import {
    fetchTransactions as reduxFetchTransactions,
    selectStabilityTransactionHistory,
    selectTransactions,
} from '../redux/transactions'
import {
    Federation,
    LoadedFederation,
    MatrixRoom,
    MatrixRoomMember,
    MSats,
    MultispendActiveInvitation,
    MultispendFinalized,
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
    makeMultispendTransactionHistoryCSV,
} from '../utils/csv'
import { FedimintBridge } from '../utils/fedimint'
import {
    coerceMultispendTxn,
    isWithdrawalRequestRejected,
} from '../utils/matrix'
import {
    makeStabilityTxnDetailItems as makeStabilityTxnDetailItemsUtil,
    makeStabilityTxnFeeDetails as makeStabilityTxnFeeDetailsUtil,
    makeTxnAmountText as makeTxnAmountTextUtil,
    makeTxnDetailItems as makeTxnDetailItemsUtil,
    makeTxnFeeDetails as makeTxnFeeDetailsUtil,
    makeTxnStatusText as makeTxnStatusTextUtil,
    makeTxnTypeText as makeTxnTypeTextUtil,
    makeTxnDetailTitleText as makeTxnDetailTitleTextUtil,
    makeMultispendTxnStatusText as makeMultispendTxnStatusTextUtil,
    makeMultispendTxnDetailItems as makeMultispendTxnDetailItemsUtil,
    makeTransactionAmountState,
    shouldShowAskFedi,
    makeTxnStatusBadge,
} from '../utils/transaction'
import { useAmountFormatter, useBtcFiatPrice } from './amount'
import { useFedimint } from './fedimint'
import { useCommonDispatch, useCommonSelector } from './redux'

export function useTransactionHistory(
    federationId: Federation['id'],
    // IMPORTANT: since this hook is used on the error screen, the FedimintContext may not be available
    // For normal use cases unrelated to log exporting, you don't need to pass in this argument
    fedimintBridge?: FedimintBridge,
) {
    const dispatch = useCommonDispatch()
    // Falls back to `fedimintBridge` if the context is not available
    const fedimint = useContext(FedimintContext) ?? fedimintBridge
    const transactions = useCommonSelector(s =>
        selectTransactions(s, federationId),
    )
    const stabilityPoolTxns = useCommonSelector(s =>
        selectStabilityTransactionHistory(s, federationId),
    )

    const fetchTransactions = useCallback(
        async (
            args?: Pick<
                Parameters<typeof reduxFetchTransactions>[0],
                'limit' | 'more' | 'refresh'
            >,
        ) => {
            if (!federationId || !fedimint) return []
            return dispatch(
                reduxFetchTransactions({
                    federationId,
                    fedimint,
                    ...args,
                }),
            ).unwrap()
        },
        [dispatch, fedimint, federationId],
    )

    return {
        transactions,
        stabilityPoolTxns,
        fetchTransactions,
    }
}

export function useTxnDisplayUtils(
    t: TFunction,
    federationId?: Federation['id'],
    isStabilityPool = false,
) {
    const selectedCurrency = useCommonSelector(s =>
        selectCurrency(s, federationId),
    )
    const { convertCentsToFormattedFiat, convertSatsToFormattedFiat } =
        useBtcFiatPrice(selectedCurrency, federationId)
    const transactionDisplayType = useCommonSelector(
        selectTransactionDisplayType,
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        currency: selectedCurrency,
        federationId,
    })
    const preferredCurrency =
        transactionDisplayType === 'fiat'
            ? selectedCurrency
            : t('words.sats').toUpperCase()

    const getShowAskFedi = useCallback(
        (txn: TransactionListEntry): boolean => shouldShowAskFedi(txn),
        [],
    )

    const getCurrencyText = useCallback(
        (txn: TransactionListEntry): string =>
            transactionDisplayType === 'fiat' && txn.txDateFiatInfo
                ? txn.txDateFiatInfo.fiatCode
                : preferredCurrency,
        [preferredCurrency, transactionDisplayType],
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
                transactionDisplayType,
                makeFormattedAmountsFromMSats,
                convertCentsToFormattedFiat,
            )
        },
        [
            convertCentsToFormattedFiat,
            makeFormattedAmountsFromMSats,
            selectedCurrency,
            transactionDisplayType,
            t,
        ],
    )

    const makeTxnAmountText = useCallback(
        (txn: TransactionListEntry, includeCurrency = false) => {
            return makeTxnAmountTextUtil(
                txn,
                transactionDisplayType,
                isStabilityPool,
                includeCurrency,
                preferredCurrency,
                makeFormattedAmountsFromMSats, // Use the helper that expects an amount in MSats
                convertCentsToFormattedFiat,
                convertSatsToFormattedFiat,
            )
        },
        [
            convertCentsToFormattedFiat,
            convertSatsToFormattedFiat,
            isStabilityPool,
            makeFormattedAmountsFromMSats,
            preferredCurrency,
            transactionDisplayType,
        ],
    )

    const makeTxnNotesText = useCallback((txn: TransactionListEntry) => {
        return txn.txnNotes ?? ''
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

    return {
        preferredCurrency,
        getCurrencyText,
        getShowAskFedi,
        makeTxnDetailItems,
        makeTxnFeeDetailItems,
        makeTxnAmountText,
        makeTxnNotesText,
        makeStabilityTxnFeeDetailItems,
        makeStabilityTxnDetailItems,
        makeTxnTypeText,
        makeTxnStatusText,
        makeTxnDetailTitleText,
    }
}

export function useMultispendTxnDisplayUtils(t: TFunction, roomId: RpcRoomId) {
    const { convertCentsToFormattedFiat } = useBtcFiatPrice()
    const selectedCurrency = useCommonSelector(selectCurrency)
    const transactionDisplayType = useCommonSelector(
        selectTransactionDisplayType,
    )
    const preferredCurrency =
        transactionDisplayType === 'fiat'
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
            if (
                multispendStatus &&
                isWithdrawalRequestRejected(txn, multispendStatus)
            )
                return t('words.failed')

            return makeMultispendTxnStatusTextUtil(t, txn, multispendStatus)
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
                return `+${convertCentsToFormattedFiat(fiatAmount, 'none')}${includeCurrency ? ` ${preferredCurrency || SupportedCurrency.USD}` : ''}`
            }
            if (txn.state === 'withdrawal') {
                const isRejected = multispendStatus
                    ? isWithdrawalRequestRejected(txn, multispendStatus)
                    : true
                const hasFailed =
                    txn.event.withdrawalRequest.txSubmissionStatus !==
                        'unknown' &&
                    'rejected' in txn.event.withdrawalRequest.txSubmissionStatus

                const fiatAmount = txn.event.withdrawalRequest.request
                    .transfer_amount as UsdCents
                return `${isRejected || hasFailed ? '' : '-'}${convertCentsToFormattedFiat(fiatAmount, 'none')}${includeCurrency ? ` ${preferredCurrency || SupportedCurrency.USD}` : ''}`
            }
            return '-'
        },
        [convertCentsToFormattedFiat, preferredCurrency, multispendStatus],
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
            if (
                multispendStatus &&
                isWithdrawalRequestRejected(txn, multispendStatus)
            )
                return 'failed'

            return makeTransactionAmountState(txn)
        },
        [multispendStatus],
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

    const makeMultispendTxnStatusBadge = useCallback(
        (txn: MultispendTransactionListEntry) => {
            if (
                multispendStatus &&
                isWithdrawalRequestRejected(txn, multispendStatus)
            )
                return 'failed'

            return makeTxnStatusBadge(txn)
        },
        [multispendStatus],
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
        makeMultispendTxnStatusBadge,
    }
}

export type ExportResult =
    | {
          success: true
          uri: string
          fileName: string
      }
    | {
          success: false
          message: string
      }

export function useExportTransactions(
    t: TFunction,
    federationId: Federation['id'],
) {
    const { fetchTransactions } = useTransactionHistory(federationId)
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId,
    })

    const exportTransactions = useCallback(
        async (federation: LoadedFederation): Promise<ExportResult> => {
            try {
                const transactions = await fetchTransactions({
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

export function useExportMultispendTransactions(t: TFunction) {
    const preferredCurrency = useCommonSelector(selectCurrency)
    const { convertCentsToFormattedFiat } = useBtcFiatPrice()
    const dispatch = useCommonDispatch()
    const fedimint = useFedimint()

    const exportMultispendTransactions = useCallback(
        async (
            room: MatrixRoom,
            multispendStatus?:
                | MultispendActiveInvitation
                | MultispendFinalized
                | undefined,
            roomMembers?: MatrixRoomMember[],
        ): Promise<ExportResult> => {
            try {
                // Fetch all transactions with high limit for full export
                const transactions =
                    (await dispatch(
                        fetchMultispendTransactions({
                            fedimint,
                            roomId: room.id,
                            limit: 10000,
                        }),
                    ).unwrap()) || []

                const coercedTxns = transactions.map(coerceMultispendTxn)

                // convert room name to filename-friendly string
                const roomName = room.name
                    ? room.name.toLowerCase().replace(/ /g, '-')
                    : undefined

                const fileName = makeCSVFilename(
                    roomName
                        ? `multispend-transactions-${roomName}`
                        : 'multispend-transactions',
                )
                const uri = makeBase64CSVUri(
                    makeMultispendTransactionHistoryCSV(
                        coercedTxns,
                        convertCentsToFormattedFiat,
                        t,
                        preferredCurrency,
                        multispendStatus,
                        roomMembers,
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
        [dispatch, fedimint, convertCentsToFormattedFiat, t, preferredCurrency],
    )

    return exportMultispendTransactions
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
export function useFeeDisplayUtils(t: TFunction, federationId: string) {
    const ecashFeeSchedule = useCommonSelector(s =>
        selectEcashFeeSchedule(s, federationId),
    )
    const stabilityPoolFeeSchedule = useCommonSelector(s =>
        selectStabilityPoolFeeSchedule(s, federationId),
    )
    const stabilityPoolAverageFeeRate = useCommonSelector(s =>
        selectStabilityPoolAverageFeeRate(s, federationId),
    )
    const { makeFormattedAmountsFromMSats, makeFormattedAmountsFromCents } =
        useAmountFormatter({
            federationId,
        })
    const stabilityConfig = useCommonSelector(s =>
        selectFederationStabilityPoolConfig(s, federationId),
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
        const { formattedPrimaryAmount: formattedTotalAmount } =
            makeFormattedAmountsFromMSats((amount + totalFees) as MSats)

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
            formattedTotalFee,
            formattedTotalAmount,
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

    const makeSPDepositFeeContent = (amount: Sats) => {
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

    const makeSPTransferFeeContent = () => {
        // TODO: Implement real fees
        const fediFee: UsdCents = 0 as UsdCents
        const federationFee: UsdCents = 0 as UsdCents
        const totalFees: UsdCents = (fediFee + federationFee) as UsdCents
        const { formattedPrimaryAmount: formattedFediFee } =
            makeFormattedAmountsFromCents(fediFee)
        const { formattedPrimaryAmount: formattedFederationFee } =
            makeFormattedAmountsFromCents(federationFee)
        const { formattedPrimaryAmount: formattedTotalFee } =
            makeFormattedAmountsFromCents(totalFees)

        const spTransferFeeItems: FeeItem[] = [
            {
                label: t('phrases.fedi-fee'),
                formattedAmount: `${formattedFediFee}`,
            },
            {
                label: t('phrases.federation-fee'),
                formattedAmount: `${formattedFederationFee}`,
            },
        ]

        return {
            feeItemsBreakdown: spTransferFeeItems,
            formattedTotalFee: `${formattedTotalFee}`,
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
        makeSPDepositFeeContent,
        makeSPTransferFeeContent,
    }
}
