import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import { TFunction } from 'i18next'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
    useMonitorGuardianTransfer,
    useMonitorReplacementCandidates,
    useWalletServiceHasQuorum,
} from '@fedi/common/hooks/fa'
import { useWalletFederationSelection } from '@fedi/common/hooks/federation'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    getGuardianTransferErrorKey,
    previewGuardianTransferDestination,
    refreshWalletServiceEligiblePayers,
    selectFederationBalance,
    selectGuardianTransfer,
    selectGuardianTransferSeats,
    selectIsWalletServiceGuardianTransferEnabled,
    selectReplacementCandidates,
    selectReplacementCheckedAt,
    selectTransferDestinationPreview,
    selectWalletServiceEligiblePayerIds,
    startGuardianTransfer,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import {
    RpcFaGuardianTransfer,
    RpcFaOperationError,
    RpcFaSelectionReauthorizationReason,
    RpcFaTransferDestinationPreview,
} from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { GuardianTransferProgress } from '../components/feature/walletservice/GuardianTransferProgress'
import {
    GuardianTransferNotice,
    GuardianTransferReview,
} from '../components/feature/walletservice/GuardianTransferReview'
import { GuardianTransferSeatList } from '../components/feature/walletservice/GuardianTransferSeatList'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import { Column } from '../components/ui/Flex'
import { SafeAreaContainer } from '../components/ui/SafeArea'
import { WalletServiceFooter } from '../components/ui/WalletServiceFooter'
import { WarningBanner } from '../components/ui/WarningBanner'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import type { RootStackParamList } from '../types/navigation'

const log = makeLog('WalletServiceGuardianTransfer')

/**
 * Start refusals that leave a new preview as the way forward. Each one means
 * the host or its price moved under the user, so the review stays up with a
 * fresh price rather than throwing the user back to the list.
 */
const RE_PREVIEW_REASONS: RpcFaSelectionReauthorizationReason[] = [
    'previewExpired',
    'advertisementEstimateExceedsLimit',
    'selectedMgUnavailable',
    'quoteTotalExceedsLimit',
    'quoteTermsChanged',
    'verifierEnvironmentChanged',
]

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'WalletServiceGuardianTransfer'
>

const getSeatName = (
    seats: { index: number; name: string | null }[],
    seatIndex: number,
    t: TFunction,
) =>
    seats.find(seat => seat.index === seatIndex)?.name ??
    t('feature.wallet-service.guardian-fallback-name', {
        number: seatIndex + 1,
    })

/** What the list says in place after a refusal that dropped the seat. */
type ListNotice =
    | { type: 'notEligible'; seatIndex: number }
    | { type: 'unavailable' }

/**
 * The notice for a refusal the list can explain, or null for one to toast.
 *
 * `capabilityUnavailable` from a start is a policy that does not enable
 * guardian transfer yet: fa-client refuses before buying a seat.
 */
const getListNotice = (
    error: RpcFaOperationError | undefined,
    seatIndex: number | null,
): ListNotice | null => {
    if (error?.code === 'replacementNotEligible' && seatIndex !== null)
        return { type: 'notEligible', seatIndex }
    if (error?.code === 'capabilityUnavailable') return { type: 'unavailable' }
    return null
}

/**
 * The notice a refused start leaves on the review, or null when the review
 * cannot stay up for it.
 */
const getStartFailureNotice = (
    error: RpcFaOperationError | undefined,
): GuardianTransferNotice | null => {
    if (
        error?.detail?.type === 'selectionReauthorizationRequired' &&
        error.detail.reason === 'selectedPayerInsufficientFunds'
    )
        return 'paymentFailed'
    if (error?.code === 'payment') return 'paymentFailed'
    if (
        error?.detail?.type === 'selectionReauthorizationRequired' &&
        RE_PREVIEW_REASONS.includes(error.detail.reason)
    )
        return 'quoteChanged'
    return null
}

type NoFreeHost = { requested: number; selected: number }

type ShownQuote = { mgId: string; advertisedPriceMsats: string }

const isSameQuote = (next: ShownQuote, shown: ShownQuote) =>
    next.mgId === shown.mgId &&
    next.advertisedPriceMsats === shown.advertisedPriceMsats

const useShowTransferError = () => {
    const { t } = useTranslation()
    const toast = useToast()
    return useCallback(
        (error: unknown) =>
            toast.show({
                content: t(
                    getGuardianTransferErrorKey(
                        error as RpcFaOperationError | undefined,
                    ),
                ),
                status: 'error',
            }),
        [toast, t],
    )
}

/**
 * The destination preview for the picked seat.
 *
 * No free host is a waiting state with its own banner and retry, so it keeps
 * the seat. Any other failure toasts and calls `onUnexplained`.
 */
const useTransferPreview = (onUnexplained: (error: unknown) => void) => {
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const [noFreeHost, setNoFreeHost] = useState<NoFreeHost | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)

    /** Resolves to the new preview, or null when there is none to show. */
    const fetchPreview = useCallback(
        async (seatIndex: number) => {
            setNoFreeHost(null)
            try {
                return await dispatch(
                    previewGuardianTransferDestination({ fedimint, seatIndex }),
                ).unwrap()
            } catch (error) {
                log.error('previewGuardianTransferDestination', error)
                const opError = error as RpcFaOperationError | undefined
                if (opError?.detail?.type === 'insufficientMgSeats')
                    setNoFreeHost({
                        requested: opError.detail.requested,
                        selected: opError.detail.selected,
                    })
                else onUnexplained(error)
                return null
            }
        },
        [dispatch, fedimint, onUnexplained],
    )

    /** A fresh preview with the review left up, resolving to it or null. */
    const refetchPreview = useCallback(
        async (seatIndex: number) => {
            setIsRefreshing(true)
            try {
                return await fetchPreview(seatIndex)
            } finally {
                setIsRefreshing(false)
            }
        },
        [fetchPreview],
    )

    const clearNoFreeHost = useCallback(() => setNoFreeHost(null), [])

    return {
        noFreeHost,
        isRefreshing,
        fetchPreview,
        refetchPreview,
        clearNoFreeHost,
    }
}

/**
 * The seat being replaced, and the preview and start calls that follow it.
 *
 * A failure the review can explain stays on the review as a banner. `busy`
 * and anything unexplained toast, and only the unexplained ones drop the seat.
 */
const useStartGuardianTransfer = (
    paymentFederationId: string | undefined,
    initialSeatIndex: number | undefined,
) => {
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const showError = useShowTransferError()

    const [seatIndex, setSeatIndex] = useState<number | null>(
        initialSeatIndex ?? null,
    )
    // a seat picked on the way in is searched for as soon as the move is
    // read, so it starts out searching rather than showing a stale preview
    const [isPreviewing, setIsPreviewing] = useState(
        initialSeatIndex !== undefined,
    )
    const [isStarting, setIsStarting] = useState(false)
    const [notice, setNotice] = useState<GuardianTransferNotice | null>(null)
    // the guardian the bridge said no longer needs replacing, for the list
    const [listNotice, setListNotice] = useState<ListNotice | null>(null)
    const seatIndexRef = useUpdatingRef(seatIndex)

    const dropSeat = useCallback(
        (error: unknown) => {
            // the list says these in place: no money moved, and there is
            // nothing to retry on the review
            const nextListNotice = getListNotice(
                error as RpcFaOperationError | undefined,
                seatIndexRef.current,
            )
            if (nextListNotice) setListNotice(nextListNotice)
            else showError(error)
            setSeatIndex(null)
        },
        [showError, seatIndexRef],
    )
    const {
        noFreeHost,
        isRefreshing,
        fetchPreview,
        refetchPreview,
        clearNoFreeHost,
    } = useTransferPreview(dropSeat)

    const handleSelectSeat = useCallback(
        async (index: number) => {
            setSeatIndex(index)
            setNotice(null)
            setListNotice(null)
            setIsPreviewing(true)
            try {
                await fetchPreview(index)
            } finally {
                setIsPreviewing(false)
            }
        },
        [fetchPreview],
    )

    /**
     * A fresh price for the seat already picked.
     *
     * The user approved the price they last saw, so a new host or a new price
     * says so in a banner rather than slipping in under the same button.
     */
    const refreshQuote = useCallback(
        async (shown: ShownQuote | null) => {
            if (seatIndex === null) return
            const next = await refetchPreview(seatIndex)
            if (next && shown && !isSameQuote(next, shown))
                setNotice('quoteChanged')
        },
        [seatIndex, refetchPreview],
    )

    const handleStartFailure = useCallback(
        async (error: unknown) => {
            const opError = error as RpcFaOperationError | undefined
            const failureNotice = getStartFailureNotice(opError)
            if (failureNotice && seatIndex !== null) {
                // the reducer dropped the refused preview, so the review
                // needs a new one to stay up
                setNotice(failureNotice)
                await refetchPreview(seatIndex)
                return
            }
            // `busy` keeps the preview, so the same review can be retried
            if (opError?.code === 'busy') showError(error)
            else dropSeat(error)
        },
        [seatIndex, refetchPreview, showError, dropSeat],
    )

    const handleStart = useCallback(async () => {
        if (seatIndex === null || !paymentFederationId) return
        setIsStarting(true)
        setNotice(null)
        try {
            await dispatch(
                startGuardianTransfer({ fedimint, paymentFederationId }),
            ).unwrap()
        } catch (error) {
            log.error('startGuardianTransfer', error)
            await handleStartFailure(error)
        } finally {
            setIsStarting(false)
        }
    }, [seatIndex, paymentFederationId, dispatch, fedimint, handleStartFailure])

    const handleBackToSeats = useCallback(() => {
        setSeatIndex(null)
        setNotice(null)
        clearNoFreeHost()
    }, [clearNoFreeHost])

    return {
        seatIndex,
        isPreviewing,
        isRefreshing,
        isStarting,
        notice,
        listNotice,
        noFreeHost,
        handleSelectSeat,
        refreshQuote,
        handleStart,
        handleBackToSeats,
    }
}

/** The wallet that pays for the new seat, and its balance. */
const usePaymentFederation = () => {
    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const eligiblePayerIds = useAppSelector(selectWalletServiceEligiblePayerIds)
    const { selectedFederation: paymentFederation } =
        useWalletFederationSelection(eligiblePayerIds)
    const paymentBalance = useAppSelector(s =>
        paymentFederation
            ? selectFederationBalance(s, paymentFederation.id)
            : (0 as MSats),
    )

    useEffect(() => {
        dispatch(refreshWalletServiceEligiblePayers({ fedimint }))
    }, [dispatch, fedimint])

    return { eligiblePayerIds, paymentFederation, paymentBalance }
}

/**
 * Pick the guardian chosen on the way in, once the bridge has said no move
 * is open.
 */
const usePreselectSeat = (
    preselectedSeat: number | undefined,
    canStart: boolean,
    onSelectSeat: (index: number) => void,
) => {
    const hasPreselected = useRef(false)
    useEffect(() => {
        if (!canStart || preselectedSeat === undefined) return
        if (hasPreselected.current) return
        hasPreselected.current = true
        onSelectSeat(preselectedSeat)
    }, [canStart, preselectedSeat, onSelectSeat])
}

/**
 * The move this screen watched, once it has completed.
 *
 * A move already finished when the screen opened is history, not news. Only
 * one this screen watched, or started, ends on the done state.
 */
const useFinishedGuardianTransfer = (
    isStarting: boolean,
    transfer: RpcFaGuardianTransfer | null | undefined,
) => {
    const [hasWatched, setHasWatched] = useState(false)
    const isOpen = !!transfer && transfer.phase !== 'completed'
    useEffect(() => {
        if (isStarting || isOpen) setHasWatched(true)
    }, [isStarting, isOpen])
    // the bridge keeps a finished move as `completed` until the next start
    return hasWatched && transfer?.phase === 'completed' ? transfer : null
}

/**
 * The open or watched move, as the bridge streams it.
 *
 * `canStart` is true once the bridge has said no move is open.
 */
const useWatchGuardianTransfer = (isStarting: boolean) => {
    const transfer = useAppSelector(selectGuardianTransfer)
    const isTransferOpen = !!transfer && transfer.phase !== 'completed'
    const finishedMove = useFinishedGuardianTransfer(isStarting, transfer)
    return {
        transfer,
        shownMove: isTransferOpen ? transfer : finishedMove,
        isFinished: !isTransferOpen && !!finishedMove,
        canStart: transfer !== undefined && !isTransferOpen,
    }
}

type FlowStep =
    | {
          type: 'progress'
          transfer: RpcFaGuardianTransfer
          isFinished: boolean
      }
    | { type: 'loading'; isSearching: boolean }
    | { type: 'list' }
    | { type: 'noFreeHost'; seatIndex: number; noFreeHost: NoFreeHost }
    | {
          type: 'review'
          seatIndex: number
          preview: RpcFaTransferDestinationPreview
      }

/** Which view the flow shows, first match wins. */
const getFlowStep = ({
    transfer,
    shownMove,
    isFinished,
    seatIndex,
    isPreviewing,
    noFreeHost,
    preview,
}: {
    transfer: RpcFaGuardianTransfer | null | undefined
    shownMove: RpcFaGuardianTransfer | null | undefined
    isFinished: boolean
    seatIndex: number | null
    isPreviewing: boolean
    noFreeHost: NoFreeHost | null
    preview: RpcFaTransferDestinationPreview | null
}): FlowStep => {
    if (shownMove) return { type: 'progress', transfer: shownMove, isFinished }
    if (transfer === undefined)
        return { type: 'loading', isSearching: seatIndex !== null }
    if (seatIndex === null) return { type: 'list' }
    if (noFreeHost && !isPreviewing)
        return { type: 'noFreeHost', seatIndex, noFreeHost }
    // also the gap while a refused start's dropped preview is replaced
    if (!preview || isPreviewing) return { type: 'loading', isSearching: true }
    return { type: 'review', seatIndex, preview }
}

const GuardianTransferLoading: React.FC<{
    isSearching: boolean
    onReturnHome: () => void
}> = ({ isSearching, onReturnHome }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                title={t(
                    isSearching
                        ? 'feature.wallet-service.transfer-review-title'
                        : 'feature.wallet-service.transfer-title',
                )}
            />
            <SafeAreaContainer
                style={styles(theme).centered}
                edges="horizontal"
                padding="lg">
                <ActivityIndicator />
                {isSearching && (
                    <Column align="center" gap="xs">
                        <Text bold center>
                            {t('feature.wallet-service.transfer-searching')}
                        </Text>
                        <Text caption center color={theme.colors.darkGrey}>
                            {t(
                                'feature.wallet-service.transfer-searching-body',
                            )}
                        </Text>
                    </Column>
                )}
            </SafeAreaContainer>
            <WalletServiceFooter>
                <Button
                    fullWidth
                    outline
                    testID="return-home-button"
                    title={t('phrases.return-to-home')}
                    onPress={onReturnHome}
                />
            </WalletServiceFooter>
        </>
    )
}

const GuardianTransferNoFreeHost: React.FC<{
    seats: { requested: number; selected: number }
    onRetry: () => void
    onBack: () => void
    onReturnHome: () => void
}> = ({ seats, onRetry, onBack, onReturnHome }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                onBackButtonPress={onBack}
                title={t('feature.wallet-service.transfer-review-title')}>
                <WarningBanner
                    level="warning"
                    icon="AlertWarningTriangleOutline"
                    title={t('feature.wallet-service.not-enough-title')}
                    message={t('feature.wallet-service.transfer-not-found', {
                        selected: seats.selected,
                        requested: seats.requested,
                    })}
                />
            </WalletServiceScreenHeader>
            {/* nothing between banner and actions, but the actions still
                belong at the bottom like every other step */}
            <View style={styles(theme).footerSpacer} />
            <WalletServiceFooter>
                <Button
                    fullWidth
                    testID="transfer-retry-button"
                    title={t('words.retry')}
                    onPress={onRetry}
                />
                <Button
                    fullWidth
                    outline
                    testID="return-home-button"
                    title={t('phrases.return-to-home')}
                    onPress={onReturnHome}
                />
            </WalletServiceFooter>
        </>
    )
}

/**
 * Replace one guardian of a formed Federation with one on a new host.
 *
 * The bridge holds at most one move, and a paid move cannot be cancelled. So
 * an open move is all this screen shows, and a new one is only offered when
 * the bridge has said there is none.
 */
const GuardianTransferFlow: React.FC<Props> = ({ navigation, route }) => {
    const { t } = useTranslation()

    const preview = useAppSelector(selectTransferDestinationPreview)
    const seats = useAppSelector(selectGuardianTransferSeats)
    useMonitorReplacementCandidates()
    useMonitorGuardianTransfer()
    const candidates = useAppSelector(selectReplacementCandidates)
    const checkedAt = useAppSelector(selectReplacementCheckedAt)
    const { eligiblePayerIds, paymentFederation, paymentBalance } =
        usePaymentFederation()
    const preselectedSeat = route.params?.seatIndex
    const {
        seatIndex,
        isPreviewing,
        isRefreshing,
        isStarting,
        notice,
        listNotice,
        noFreeHost,
        handleSelectSeat,
        refreshQuote,
        handleStart,
        handleBackToSeats,
    } = useStartGuardianTransfer(paymentFederation?.id, preselectedSeat)
    const hasQuorum = useWalletServiceHasQuorum()

    const returnHome = useCallback(
        () => navigation.navigate('WalletServiceDashboard'),
        [navigation],
    )
    const { transfer, shownMove, isFinished, canStart } =
        useWatchGuardianTransfer(isStarting)
    usePreselectSeat(preselectedSeat, canStart, handleSelectSeat)

    const handleRefreshQuote = useCallback(
        () => refreshQuote(preview),
        [refreshQuote, preview],
    )
    // a guardian picked elsewhere has no list to go back to here
    const handleBackFromReview =
        preselectedSeat === undefined
            ? handleBackToSeats
            : () => navigation.goBack()

    const step = getFlowStep({
        transfer,
        shownMove,
        isFinished,
        seatIndex,
        isPreviewing,
        noFreeHost,
        preview,
    })
    switch (step.type) {
        case 'progress':
            return (
                <GuardianTransferProgress
                    transfer={step.transfer}
                    isFinished={step.isFinished}
                    onReturnHome={returnHome}
                />
            )
        case 'loading':
            return (
                <GuardianTransferLoading
                    isSearching={step.isSearching}
                    onReturnHome={returnHome}
                />
            )
        case 'list':
            return (
                <GuardianTransferSeatList
                    candidates={candidates}
                    checkedAt={checkedAt}
                    hasQuorum={hasQuorum}
                    notice={
                        listNotice === null
                            ? null
                            : listNotice.type === 'notEligible'
                              ? t(
                                    'feature.wallet-service.transfer-not-eligible-banner',
                                    {
                                        name: getSeatName(
                                            seats,
                                            listNotice.seatIndex,
                                            t,
                                        ),
                                    },
                                )
                              : t(
                                    'feature.wallet-service.transfer-unavailable-banner',
                                )
                    }
                    disabled={isPreviewing}
                    onSelect={handleSelectSeat}
                    onDone={() => navigation.goBack()}
                />
            )
        case 'noFreeHost':
            return (
                <GuardianTransferNoFreeHost
                    seats={step.noFreeHost}
                    onRetry={() => handleSelectSeat(step.seatIndex)}
                    onBack={handleBackFromReview}
                    onReturnHome={returnHome}
                />
            )
        case 'review':
            return (
                <GuardianTransferReview
                    seatName={getSeatName(seats, step.seatIndex, t)}
                    preview={step.preview}
                    eligiblePayerIds={eligiblePayerIds}
                    paymentFederation={paymentFederation}
                    balanceMsats={paymentBalance}
                    notice={notice}
                    isRefreshing={isRefreshing}
                    isStarting={isStarting}
                    hasQuorum={hasQuorum}
                    onStart={handleStart}
                    onRefreshQuote={handleRefreshQuote}
                    onBack={handleBackFromReview}
                />
            )
    }
}

/** The flag gate: with guardian replacement off, the route leads nowhere. */
const WalletServiceGuardianTransfer: React.FC<Props> = props => {
    const isEnabled = useAppSelector(
        selectIsWalletServiceGuardianTransferEnabled,
    )
    const { navigation } = props

    useEffect(() => {
        if (!isEnabled) navigation.goBack()
    }, [isEnabled, navigation])

    if (!isEnabled) return null

    return <GuardianTransferFlow {...props} />
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        centered: {
            alignItems: 'center',
            gap: theme.spacing.md,
            justifyContent: 'center',
        },
        footerSpacer: {
            flex: 1,
        },
    })

export default WalletServiceGuardianTransfer
