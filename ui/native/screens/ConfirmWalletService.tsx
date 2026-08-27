import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button, Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import {
    useFederationPreview,
    useWalletFederationSelection,
} from '@fedi/common/hooks/federation'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { type JoinableWalletService } from '@fedi/common/hooks/fi'
import { useToast } from '@fedi/common/hooks/toast'
import {
    createWalletService,
    getWalletServiceRetryableError,
    prepareWalletServicePayment,
    refreshWalletServiceEligiblePayers,
    selectCanPayForWalletService,
    selectFederationBalance,
    selectLoadedFederations,
    selectWalletServiceEligiblePayerIds,
    selectWalletServiceFlowStatus,
    selectWalletServicePayerAvailability,
    selectWalletServiceSelectionPreview,
} from '@fedi/common/redux'
import { MSats } from '@fedi/common/types'
import { RpcFiOperationError } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import FederationPreview from '../components/feature/onboarding/FederationPreview'
import { AmountHeadline } from '../components/feature/walletservice/AmountHeadline'
import { MilestoneSpinner } from '../components/feature/walletservice/MilestoneSpinner'
import TopUpSheet from '../components/feature/walletservice/TopUpSheet'
import { WalletServiceJoinSheet } from '../components/feature/walletservice/WalletServiceJoinSheet'
import { WalletServicePayerRow } from '../components/feature/walletservice/WalletServicePayerRow'
import { WalletServiceScreenHeader } from '../components/feature/walletservice/WalletServiceScreenHeader'
import { Column, Row } from '../components/ui/Flex'
import { SafeAreaContainer, SafeScrollArea } from '../components/ui/SafeArea'
import { SummaryRow } from '../components/ui/SummaryRow'
import { WalletServiceFooter } from '../components/ui/WalletServiceFooter'
import { WarningBanner } from '../components/ui/WarningBanner'
import { useAppDispatch, useAppSelector, useAppStore } from '../state/hooks'
import { reset } from '../state/navigation'
import type { RootStackParamList } from '../types/navigation'
import { useQuoteCountdown } from '../utils/hooks/quoteCountdown'
import { useWalletServiceEntryGuard } from '../utils/hooks/walletServiceEntryGuard'

const log = makeLog('ConfirmWalletService')

export type Props = NativeStackScreenProps<
    RootStackParamList,
    'ConfirmWalletService'
>

/** This screen is step 2 of the creation flow. */
const STEP_INDEX = 1

/**
 * How hard to chase the payer a join was supposed to produce.
 *
 * Sized for recovery, not for loading. Joining a federation this seed has held
 * before restores it rather than starting it fresh, and the wallet is not an
 * eligible payer for as long as that takes — measured at 49s against staging,
 * where a first-time load is a second or two. A window sized for the fast case
 * gives up while the slow one is still working, which is the same dead end
 * with extra steps.
 *
 * The lookup is a cheap local call (~100ms), so the budget is generous and the
 * cost is small. It exists to stop polling for a wallet that is never coming.
 */
const PAYER_LOOKUP_ATTEMPTS = 90
const PAYER_LOOKUP_INTERVAL_MS = 2000

const ConfirmWalletService: React.FC<Props> = ({ navigation }) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const dispatch = useAppDispatch()
    const store = useAppStore()
    const fedimint = useFedimint()
    const toast = useToast()
    useWalletServiceEntryGuard()
    const [showTopUp, setShowTopUp] = useState(false)
    const [isPaying, setIsPaying] = useState(false)
    const [isRefreshingQuote, setIsRefreshingQuote] = useState(false)
    const [needsReauthorization, setNeedsReauthorization] = useState(false)
    const [hasToppedUp, setHasToppedUp] = useState(false)
    // the guardian pool shrank below the requested size between quotes; the
    // remedy lives on the previous screen, so this state redirects rather
    // than retries
    const [insufficientSeats, setInsufficientSeats] = useState<{
        requested: number
        eligible: number
    } | null>(null)
    // the bridge refused the spend, most often because the balance cannot
    // cover the seats plus their funding fees. `canPay` gates on the quoted
    // total alone, so the pay button stays live right up to this rejection.
    // The bridge sends no amounts with a `payment` error, so this banner says
    // what to try rather than naming a figure it cannot know. A toast is wrong
    // here: it scrolls away and its "try again" reads as a promise, when the
    // same balance fails the same way every time
    const [didPaymentFail, setDidPaymentFail] = useState(false)
    // Flow A: in no eligible wallet service. The sheet lists what could be
    // joined; picking one puts its terms on screen, which is where the
    // decision is actually made.
    const [showJoinSheet, setShowJoinSheet] = useState(false)
    const [serviceBeingJoined, setServiceBeingJoined] =
        useState<JoinableWalletService | null>(null)
    // set by an accepted join, cleared when the payer it produced turns up.
    // State rather than a ref: it has to start the poll it gates, and a ref
    // set inside the join callback would not re-run that effect. The effect,
    // and why the single post-join lookup is not enough, are documented
    // beside `canOfferJoin` below.
    const [isAwaitingJoinedPayer, setIsAwaitingJoinedPayer] = useState(false)
    const preview = useAppSelector(selectWalletServiceSelectionPreview)
    // the bridge admits only these wallets, so the picker offers only these
    // and the wallet it displays is the wallet that gets charged
    const eligiblePayerIds = useAppSelector(selectWalletServiceEligiblePayerIds)
    // why there is no payer, when there is none: joined no trusted setup
    // payment federation, or the lookup itself failed
    const payerAvailability = useAppSelector(
        selectWalletServicePayerAvailability,
    )
    const { selectedFederation: paymentFederation } =
        useWalletFederationSelection(eligiblePayerIds)
    const canPay = useAppSelector(s =>
        selectCanPayForWalletService(s, paymentFederation?.id),
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId: paymentFederation?.id,
    })

    // the live balance, not the eligible-payer snapshot: balance events keep
    // this fresh, so a top-up that lands while this screen is open updates the
    // shortfall banner and the pay button without a round trip
    const livePayerBalance = useAppSelector(s =>
        paymentFederation
            ? selectFederationBalance(s, paymentFederation.id)
            : (0 as MSats),
    )
    const payerBalanceMsats = String(livePayerBalance)

    const performQuoteRefresh = useCallback(async () => {
        setIsRefreshingQuote(true)
        try {
            await dispatch(prepareWalletServicePayment({ fedimint })).unwrap()
            setInsufficientSeats(null)
            return true
        } catch (error) {
            log.error('prepareWalletServicePayment', error)
            const opError = error as RpcFiOperationError | undefined
            // too few guardians has its own banner and redirect; a toast
            // would scroll away and leave a dead pay button unexplained
            if (opError?.detail?.type === 'insufficientFmanSeats') {
                setInsufficientSeats({
                    requested: opError.detail.requested,
                    eligible: opError.detail.eligible,
                })
                return false
            }
            toast.show({
                content: getWalletServiceRetryableError(t, opError?.code),
                status: 'error',
            })
            return false
        } finally {
            setIsRefreshingQuote(false)
        }
    }, [dispatch, fedimint, toast, t])

    /**
     * The bridge serves one FI operation at a time and answers a second with
     * `busy`, so a refresh joins the one already running rather than racing it.
     *
     * Two refreshes get asked for in the same tick on the path that produced
     * "Another Wallet Service operation is in progress": a lightning top-up
     * outlives the 120s quote, so when the payment lands `handleTopUpFunded`
     * refreshes at the same moment the expiry effect does. `isRefreshingQuote`
     * cannot gate that — it is render state and is still false in that tick —
     * so the guard has to be a ref, read and written synchronously.
     *
     * Joining rather than queueing is safe: every caller wants the same thing,
     * an unexpired `previewId`, and affordability is read from the live
     * federation balance rather than from the quote's frozen snapshot.
     */
    const quoteRefreshInFlight = useRef<Promise<boolean> | null>(null)
    const refreshQuote = useCallback(async (): Promise<boolean> => {
        if (quoteRefreshInFlight.current) return quoteRefreshInFlight.current
        const run = performQuoteRefresh()
        quoteRefreshInFlight.current = run
        try {
            return await run
        } finally {
            quoteRefreshInFlight.current = null
        }
    }, [performQuoteRefresh])

    // a replaced guardian only changes the price, so stay on the screen with a
    // fresh quote; leaving is the fallback for when no quote can be fetched
    const handleReviewNewQuote = useCallback(async () => {
        if (await refreshQuote()) {
            setNeedsReauthorization(false)
        } else {
            navigation.goBack()
        }
    }, [refreshQuote, navigation])

    // the bridge only checks quote validity at pay time, so the screen owns
    // the clock: at expiry the pay button locks and a fresh quote is fetched
    // before the user can act on a stale price
    //
    // The deadline only exists where there is something to miss it. With no
    // wallet to pay from, the user's next move is a join and a top-up, which
    // outlasts any 120s quote — so a clock here expired into a "Quote expired"
    // line under a price nobody could act on, and armed the auto-refresh below
    // to re-run the most expensive RPC there is on a loop, for nothing. The
    // price is re-quoted at the two moments it matters instead: after a join
    // (`handleAcceptTerms`) and after a top-up (`handleTopUpFunded`).
    //
    // An open top-up sheet is the same case. It covers the price, so the user
    // cannot act on the deadline, and a lightning deposit routinely outlives
    // it — leaving the clock running only spent the selection RPC on a quote
    // nobody could see, mid-payment. `handleTopUpFunded` re-quotes on the way
    // out, which is the moment the price is worth having again.
    const isQuoteOnScreen = Boolean(paymentFederation) && !showTopUp
    const { remainingLabel, isExpired } = useQuoteCountdown(
        isQuoteOnScreen ? (preview?.validUntil ?? null) : null,
    )
    // one attempt per expiry, re-armed only by a quote that is actually valid.
    //
    // Keying this on `preview.validUntil` looked equivalent and was not. The
    // bridge stamps `validUntil` when selection *starts*
    // (FMAN_SELECTION_PREVIEW_VALIDITY = 120s) and selection itself takes
    // 30-60s, longer on a degraded fleet. So a slow selection returns a quote
    // that is already expired — with a *new* validUntil, which the old guard
    // read as a new deadline worth one more attempt. Every expired quote
    // licensed the next one: an unbounded loop of the most expensive RPC there
    // is, and the guardian-set flicker that came with it.
    const hasAutoRefreshed = useRef(false)
    useEffect(() => {
        if (!preview || isRefreshingQuote) return
        if (!isExpired) {
            // a usable quote: allow one more attempt when this one runs out
            hasAutoRefreshed.current = false
            return
        }
        if (hasAutoRefreshed.current) return
        hasAutoRefreshed.current = true
        refreshQuote()
    }, [isExpired, preview, isRefreshingQuote, refreshQuote])

    const handleOpenTopUp = useCallback(() => setShowTopUp(true), [])

    // The terms screen is the onboarding one, unchanged: it already renders
    // the welcome text, the limits from meta, "I accept" / "I do not accept"
    // and the `by-clicking-i-accept` line, and joins through the same thunk.
    const {
        isJoining,
        isFetchingPreview,
        federationPreview,
        setFederationPreview,
        handleCode,
        handleJoin,
    } = useFederationPreview(t, '')

    /**
     * A join is under way and the card has nothing left to offer.
     *
     * Pressing Join in the sheet dismisses the sheet at once but the terms take
     * a network round trip to arrive, so the user landed back here looking at a
     * live "Join a wallet service" button with no sign that anything was
     * happening — and pressing it reopened the sheet on top of the join it had
     * just started. The same hole reopens after the terms are accepted: joining
     * takes seconds, and the payer poll that follows it takes seconds more,
     * with the card still on screen the whole time because there is still no
     * payer.
     *
     * So the button is the card's resting state and this covers every step from
     * the Join press to a wallet that can pay: the preview fetch, the join
     * itself, and the wait for the joined wallet to become an eligible payer.
     * Each way out clears it — declining the terms, a failed fetch, the poll
     * giving up — so the button always comes back rather than the card
     * spinning forever.
     */
    const isJoinInFlight =
        isFetchingPreview || isJoining || isAwaitingJoinedPayer

    const handleChooseServiceToJoin = useCallback(
        (service: JoinableWalletService) => {
            setShowJoinSheet(false)
            setServiceBeingJoined(service)
            handleCode(service.inviteCode)
        },
        [handleCode],
    )

    // "I do not accept" returns to the list rather than to a screen with
    // nothing to do on it
    const handleDeclineTerms = useCallback(() => {
        setFederationPreview(undefined)
        setServiceBeingJoined(null)
        setShowJoinSheet(true)
    }, [setFederationPreview])

    // Decision ④, 21 Aug: accepting joins *and* opens the top-up, prefilled
    // with the full setup cost. A wallet joined to pay for setup holds nothing,
    // so landing back on a screen whose only live control is "Top up" and
    // making the user press it saves nobody anything.
    const handleAcceptTerms = useCallback(async () => {
        const joined = serviceBeingJoined
        await handleJoin(async () => {
            setFederationPreview(undefined)
            setServiceBeingJoined(null)
            // `joinFederation` resolving means the wallet exists, not that it
            // is usable. `fiClientEligiblePayers` reads only fully loaded
            // wallets and skips ones still loading or recovering, so a lookup
            // fired now comes back without the wallet that was just joined.
            // `isAwaitingJoinedPayer` keeps asking until it appears, and opens
            // the top-up once it has — see the effect that watches for it.
            //
            // Deliberately NOT a `refreshQuote()` here. That runs its own payer
            // lookup, and joining changes nothing about the price, so all it
            // added was a second writer to the same list: measured on staging,
            // its lookup started before the wallet had loaded and landed
            // *after* the poll's good answer, overwriting a real payer with an
            // empty list and stranding the screen on the join card. The quote
            // is re-fetched where it can actually go stale — at expiry, and
            // after a top-up.
            setIsAwaitingJoinedPayer(true)
            toast.show({
                content: t('feature.wallet-service.joined-top-up-next', {
                    federation: joined?.name ?? '',
                }),
                status: 'success',
            })
        })
    }, [handleJoin, serviceBeingJoined, setFederationPreview, toast, t])

    // Funding unlocks the payment; it never makes it (design call, 21 Aug).
    //
    // The refresh is what unlocks it. `previewId` lives only in bridge process
    // memory and the quote expires after 120s, which a lightning top-up often
    // outlives, so the price on screen after a top-up may be unpayable. One
    // fresh quote here leaves a live price above a live button, and the user
    // presses it.
    const handleTopUpFunded = useCallback(() => {
        setShowTopUp(false)
        setHasToppedUp(true)
        refreshQuote()
    }, [refreshQuote])

    const handlePay = useCallback(async () => {
        if (!paymentFederation) return
        setIsPaying(true)
        // a fresh attempt owns the banner: clear last attempt's verdict so a
        // stale failure cannot sit above a payment that is now succeeding
        setDidPaymentFail(false)
        try {
            // pay from the wallet the user sees selected, never a fresher
            // default from state
            await dispatch(
                createWalletService({
                    fedimint,
                    paymentFederationId: paymentFederation.id,
                }),
            ).unwrap()
            navigation.dispatch(reset('WalletServiceProgress'))
        } catch (error) {
            log.error('createWalletService', error)
            const opError = error as RpcFiOperationError | undefined
            // the sealed selection is gone; the banner explains why and offers
            // a fresh quote, so a toast would only duplicate it
            if (opError?.detail?.type === 'selectionReauthorizationRequired') {
                setNeedsReauthorization(true)
                return
            }
            // one reply covers both "payment dispatched" and "first build
            // attempt", so a build failure arrives here with the sats already
            // spent. The status stream tells the two apart: a formation in
            // flight means the payment went out and the entry guard is already
            // moving to the progress screen, so a "please try again" toast
            // would invite a second payment. Read the store rather than the
            // render-time selector, which predates this await
            if (
                selectWalletServiceFlowStatus(store.getState()) === 'inProgress'
            ) {
                return
            }
            // nothing was spent and the same balance fails the same way, so
            // this needs to persist next to the amount it could not cover
            if (opError?.code === 'payment') {
                setDidPaymentFail(true)
                return
            }
            toast.show({
                content: getWalletServiceRetryableError(t, opError?.code),
                status: 'error',
            })
        } finally {
            setIsPaying(false)
        }
    }, [dispatch, fedimint, paymentFederation, navigation, store, toast, t])

    // Nothing here can pay, so the offer is a join. This is deliberately a
    // constant: it does not ask whether anything is actually joinable, because
    // the sheet is what asks that, on every open. A screen that read the answer
    // would be stuck with it — one failed lookup and the user sits at "come
    // back later" with nothing to press for the life of the screen.
    //
    // Both no-payer causes qualify, because the user's situation is identical
    // either way: the bridge trusts nothing you are in, or it named wallets you
    // do not hold. A *payer* lookup that failed is not this — membership is
    // unknown, so a join offer would be a guess — and neither is one still in
    // flight.
    const canOfferJoin =
        !paymentFederation &&
        payerAvailability !== 'lookupFailed' &&
        payerAvailability !== 'unknown'

    /**
     * A wallet joined to pay for setup is not an eligible payer the instant it
     * is joined.
     *
     * `fiClientEligiblePayers` resolves each admitted federation through the
     * bridge's Ready-only lookup, so a wallet that is still `Loading` — or
     * `Recovering`, which a rejoin on a seed that held this federation before
     * always is — is dropped from the list it returns. The post-join refresh
     * fires roughly a second after `joinFederation` resolves, which is inside
     * that window, so it routinely answers "no payer" about a wallet the user
     * has just joined.
     *
     * Nothing re-asked. `eligiblePayers` is only ever written by
     * `prepareWalletServicePayment`, and every other caller of it is a user
     * action this state has no button for — so the screen settled into the
     * pre-join state permanently: the join card still offering a federation
     * the user is already in, no payer row, and a dead `Pay & create` where
     * the top-up button belongs. The one way out was the back chevron.
     *
     * So ask again, on a poll, until it turns up. The poll asks only the payer
     * question — `refreshWalletServiceEligiblePayers` rather than a full
     * `refreshQuote` — because the price did not change and re-quoting would
     * spend 30-60s of guardian dialling to answer something it was not asked.
     *
     * Bounded on both ends: armed by accepting a join, disarmed the moment a
     * payer appears, and given up on after `PAYER_LOOKUP_ATTEMPTS`. Loading is
     * seconds; a wallet still recovering can outlast the window, and that is
     * the case the footer's Return to home is left for.
     */
    const [payerLookupAttempt, setPayerLookupAttempt] = useState(0)
    const loadedFederationIds = useAppSelector(s =>
        selectLoadedFederations(s)
            .map(f => f.id)
            .join(','),
    )
    useEffect(() => {
        if (!isAwaitingJoinedPayer) return
        if (paymentFederation) {
            setIsAwaitingJoinedPayer(false)
            // Decision ④, 21 Aug: accepting a join opens the top-up. It opens
            // here rather than at the moment of joining because the sheet is
            // about a wallet, and until this point there was no wallet for it
            // to be about — it reads the payer to know what it is funding.
            setShowTopUp(true)
            return
        }
        if (payerLookupAttempt >= PAYER_LOOKUP_ATTEMPTS) {
            setIsAwaitingJoinedPayer(false)
            return
        }
        let isCancelled = false
        const timer = setTimeout(async () => {
            if (isCancelled) return
            try {
                await dispatch(
                    refreshWalletServiceEligiblePayers({ fedimint }),
                ).unwrap()
            } catch (error) {
                log.warn('eligible payer poll', error)
            }
            if (!isCancelled) setPayerLookupAttempt(attempt => attempt + 1)
        }, PAYER_LOOKUP_INTERVAL_MS)
        return () => {
            isCancelled = true
            clearTimeout(timer)
        }
        // `loadedFederationIds` is a dependency on purpose: a wallet finishing
        // its load is the event that changes the answer, so it retries at once
        // rather than waiting out the remaining interval
    }, [
        isAwaitingJoinedPayer,
        paymentFederation,
        payerLookupAttempt,
        loadedFederationIds,
        dispatch,
        fedimint,
    ])

    // V3.5 opens the list for them rather than making the card a second tap.
    // Once per mount: re-opening on every render would fight the dismiss.
    //
    // No settle delay. The sheet opens onto its own loading state, so there is
    // nothing to hide behind a timer, and the old 400ms one was guessing at the
    // length of the push transition rather than waiting for it.
    const hasAutoOpenedJoinSheet = useRef(false)
    useEffect(() => {
        if (!canOfferJoin || hasAutoOpenedJoinSheet.current) return
        hasAutoOpenedJoinSheet.current = true
        setShowJoinSheet(true)
    }, [canOfferJoin])

    const style = styles(theme)

    // The terms are a full screen in onboarding and stay one here, so the
    // decision is not made inside a sheet on top of a price.
    //
    // The header is the journey's own, not the stack's: the same chevron in
    // the same place as every other wallet service step. Its back declines
    // rather than popping the route — the default pop would abandon the whole
    // payment step from a screen the user only opened to read some terms.
    if (federationPreview) {
        return (
            <>
                <WalletServiceScreenHeader
                    backButton
                    title={t('phrases.wallet-service')}
                    onBackButtonPress={handleDeclineTerms}
                />
                <FederationPreview
                    isJoining={isJoining}
                    federation={federationPreview}
                    withNavigationHeader={false}
                    onJoin={handleAcceptTerms}
                    onBack={handleDeclineTerms}
                />
            </>
        )
    }

    // no action inside the banner: every step of this journey keeps its
    // primary action pinned at the bottom, and this state is no different —
    // the footer renders Continue while this banner is up
    const guardianSetChangedBanner = needsReauthorization ? (
        <WarningBanner
            level="warning"
            title={t('feature.wallet-service.set-changed-title')}
            message={t('feature.wallet-service.set-changed-body')}
        />
    ) : null

    // the reducer drops the selection on reauthorization, so the banner has to
    // survive the preview going away
    if (!preview) {
        return (
            <>
                <WalletServiceScreenHeader
                    backButton
                    title={t('feature.wallet-service.confirm-title')}
                    step={STEP_INDEX}>
                    {guardianSetChangedBanner}
                </WalletServiceScreenHeader>
                {/* the body always renders, even with nothing to say: it is what
                    fills the page, and without it the footer rode up under the
                    banner instead of sitting at the bottom like every other
                    step of this journey */}
                <SafeAreaContainer style={style.loadingContainer} edges="notop">
                    {!guardianSetChangedBanner && (
                        <>
                            <ActivityIndicator />
                            <Text caption color={theme.colors.darkGrey}>
                                {t('feature.wallet-service.preparing-payment')}
                            </Text>
                        </>
                    )}
                </SafeAreaContainer>
                {/* the banner carries no action of its own, so the journey's
                    pinned footer holds the Continue that fetches the new
                    quote */}
                {guardianSetChangedBanner && (
                    <WalletServiceFooter>
                        <Button
                            fullWidth
                            testID="review-new-quote-button"
                            title={t('words.continue')}
                            loading={isRefreshingQuote}
                            onPress={handleReviewNewQuote}
                        />
                    </WalletServiceFooter>
                )}
            </>
        )
    }

    const totalMsats = Number(preview.totalAdvertisedMsats) as MSats
    // setup is quoted in sats whatever the wallet displays by default, so the
    // headline is the bare sats number and the fiat line is the conversion
    const { formattedFiat } = makeFormattedAmountsFromMSats(totalMsats)
    const { formattedSats: totalSatsNumber } = makeFormattedAmountsFromMSats(
        totalMsats,
        'none',
    )
    const shortfallMsats =
        BigInt(preview.totalAdvertisedMsats) - BigInt(payerBalanceMsats)
    const guardianCountLabel = `${preview.seats.length} ${t(
        'feature.wallet-service.guardians-label',
    ).toLowerCase()}`
    // the design names the wallet, what it holds and what is needed, rather
    // than a generic "can't cover the cost"
    const insufficientMessage = t('feature.wallet-service.insufficient-body', {
        federation: paymentFederation?.name ?? '',
        available: makeFormattedAmountsFromMSats(
            Number(payerBalanceMsats) as MSats,
        ).formattedSats,
        needed: makeFormattedAmountsFromMSats(totalMsats).formattedSats,
    })
    // a top-up that still leaves the wallet short says so under the headline
    // rather than replacing it
    const stillShortMessage =
        hasToppedUp && shortfallMsats > BigInt(0)
            ? t('feature.wallet-service.topup-still-short', {
                  amount: makeFormattedAmountsFromMSats(
                      Number(shortfallMsats) as MSats,
                  ).formattedSats,
              })
            : null

    // one slot, so the most urgent thing to know is the thing under the title.
    // A lost selection outranks the rest: it invalidates the price the other
    // banners would be talking about
    const statusBanner = guardianSetChangedBanner ? (
        guardianSetChangedBanner
    ) : didPaymentFail ? (
        // outranks the quote-level banners below: they describe what the price
        // would be, this describes an attempt that already failed on it
        <WarningBanner
            level="warning"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.payment-failed-title')}
            message={t('feature.wallet-service.payment-failed-body')}
        />
    ) : insufficientSeats ? (
        <WarningBanner
            level="warning"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.not-enough-title')}
            message={t(
                'feature.wallet-service.quote-lost-guardians',
                insufficientSeats,
            )}
        />
    ) : // the join card carries this state instead; and while the payer lookup
    // is still in flight there is nothing to warn about yet — a banner
    // resolved before then would flash for the load's duration
    canOfferJoin ||
      payerAvailability === 'unknown' ? null : !paymentFederation ? (
        // Only `lookupFailed` reaches here: every other no-payer cause is an
        // offer to join, and the join card carries it. The price always renders
        // below this, so the banner explains the missing wallet rather than
        // standing in for the quote. Nothing can be offered on an unknown
        // membership, so this is the one state on this screen whose action is
        // the footer's Return to home rather than a way forward.
        <WarningBanner
            level="warning"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.payer-lookup-failed-title')}
            message={t('feature.wallet-service.payer-lookup-failed-body')}
        />
    ) : // Not suppressed while the top-up sheet is up. It looked like the
    // header was contradicting a sheet reading "Funds moved", but the header
    // was right: the wallet really was still short, and the sheet was the one
    // lying — it had reopened on the previous transfer's success state. That
    // is fixed where it belongs, in the sheet's own reset. A banner that is
    // true stays on screen.
    !canPay ? (
        <WarningBanner
            level="warning"
            icon="AlertWarningTriangleOutline"
            title={t('feature.wallet-service.insufficient-title')}
            message={stillShortMessage ?? insufficientMessage}
        />
    ) : null

    // The countdown is a deadline on an action. It only means anything where
    // there is one: a wallet that can pay, enough in it, and nothing else
    // wrong. Anywhere else it was a clock counting down to nothing, next to
    // the reason the user could not act on it anyway.
    const isQuoteActionable =
        Boolean(paymentFederation) && canPay && !statusBanner

    return (
        <>
            <WalletServiceScreenHeader
                backButton
                title={t('feature.wallet-service.confirm-title')}
                step={STEP_INDEX}>
                {statusBanner}
            </WalletServiceScreenHeader>
            <SafeScrollArea edges="notop" padding="lg">
                <Column gap="lg" grow>
                    <WalletServicePayerRow
                        allowedFederationIds={eligiblePayerIds}
                    />

                    {canOfferJoin && (
                        <Column gap="sm" align="center" style={style.joinCard}>
                            <Text medium center style={style.joinCardTitle}>
                                {t('feature.wallet-service.join-card-title')}
                            </Text>
                            <Text
                                small
                                center
                                color={theme.colors.darkGrey}
                                style={style.joinCardBody}>
                                {t('feature.wallet-service.join-card-body')}
                            </Text>
                            {/* the journey's own ring, the same one the
                                guardian set is found under, rather than the
                                platform's spokes. It stands in a box the
                                height of the button it replaces, so the card
                                keeps its size and nothing below it moves when
                                a join starts or falls through */}
                            {isJoinInFlight ? (
                                <Row
                                    center
                                    fullWidth
                                    style={style.joinCardBusy}
                                    testID="join-card-busy">
                                    <MilestoneSpinner />
                                </Row>
                            ) : (
                                <Button
                                    fullWidth
                                    testID="open-join-sheet-button"
                                    title={t(
                                        'feature.wallet-service.join-card-button',
                                    )}
                                    onPress={() => setShowJoinSheet(true)}
                                />
                            )}
                        </Column>
                    )}

                    <Column align="center" justify="center" gap="xs" grow>
                        <AmountHeadline
                            satsNumber={totalSatsNumber}
                            fiat={formattedFiat}
                            isStale={isRefreshingQuote || isExpired}
                            testID="total-setup-cost"
                        />
                        {isRefreshingQuote ? (
                            <Text
                                small
                                color={theme.colors.darkGrey}
                                testID="quote-refreshing">
                                {t('feature.wallet-service.refreshing-quote')}
                            </Text>
                        ) : isExpired && !insufficientSeats ? (
                            // says what happened; the lever to fix it is the
                            // footer button, where the action always is
                            <Text
                                small
                                color={theme.colors.darkGrey}
                                testID="quote-expired">
                                {t('feature.wallet-service.quote-expired')}
                            </Text>
                        ) : isQuoteActionable && remainingLabel ? (
                            <Text
                                small
                                color={theme.colors.darkGrey}
                                testID="quote-countdown">
                                {t('feature.wallet-service.quote-valid-for', {
                                    remaining: remainingLabel,
                                })}
                            </Text>
                        ) : null}
                    </Column>
                </Column>
            </SafeScrollArea>

            {/* pinned rather than scrolled: the shortfall banner is tall enough
                to push this off the bottom of the scroll area, and the design
                keeps it sitting directly above the action bar. With no valid
                quote there is nothing to send to, so the row hides rather than
                repeat a stale count */}
            {!insufficientSeats && (
                <View style={style.summary}>
                    {/* a plain string, so the row's own emphasis styling
                        applies: bold key, right-aligned value, no trailing
                        icon */}
                    <SummaryRow
                        isFirst
                        isEmphasised
                        label={t('feature.send.send-to')}
                        value={guardianCountLabel}
                    />
                </View>
            )}

            {/* pinned, so the commitment stays reachable without scrolling */}
            <WalletServiceFooter>
                {insufficientSeats ? (
                    // the remedy is a different guardian count, which lives on
                    // the previous screen; retry stays for a pool that refills
                    <Button
                        fullWidth
                        testID="change-guardian-count-button"
                        title={t(
                            'feature.wallet-service.change-guardian-count',
                        )}
                        onPress={() => navigation.goBack()}
                    />
                ) : !paymentFederation &&
                  !canOfferJoin &&
                  payerAvailability !== 'unknown' ? (
                    // `lookupFailed` only: membership is unknown, so nothing can
                    // be offered and the one live action is the way out — a
                    // disabled Pay & create here promised nothing. Every other
                    // no-payer state leaves by the back chevron, because its
                    // way forward is the join card above.
                    <Button
                        fullWidth
                        testID="return-home-button"
                        title={t('phrases.return-to-home')}
                        onPress={() =>
                            navigation.dispatch(
                                reset('TabsNavigator', {
                                    initialRouteName: 'Home',
                                }),
                            )
                        }
                    />
                ) : paymentFederation && !canPay ? (
                    // Nothing here can be paid until it is funded, so the one
                    // button says the one thing there is to do. A disabled
                    // "Pay & create" above it was a dead control sitting where
                    // the live one should be.
                    <Button
                        fullWidth
                        testID="top-up-button"
                        title={t('feature.wallet-service.top-up-button')}
                        onPress={handleOpenTopUp}
                    />
                ) : isExpired ? (
                    // Same rule as the shortfall above: an expired quote is not
                    // payable, and the one thing that helps is a fresh one. The
                    // automatic refresh runs once per deadline, so this is the
                    // lever for when that attempt failed.
                    <Button
                        fullWidth
                        testID="refresh-quote-button"
                        title={t('words.retry')}
                        loading={isRefreshingQuote}
                        onPress={refreshQuote}
                    />
                ) : (
                    <Button
                        fullWidth
                        testID="SendConfirmButton"
                        title={t('feature.wallet-service.pay-create-button')}
                        // a quote being replaced is not payable, but it is
                        // working rather than broken, so it says so
                        loading={isPaying || isRefreshingQuote}
                        disabled={!canPay || isRefreshingQuote}
                        // RNE's default disabled fill is near-white against a
                        // white bar, so the button reads as missing rather
                        // than blocked
                        disabledStyle={style.payDisabled}
                        disabledTitleStyle={style.payDisabledTitle}
                        onPress={handlePay}
                    />
                )}
            </WalletServiceFooter>

            {paymentFederation && (
                <TopUpSheet
                    show={showTopUp}
                    onDismiss={() => setShowTopUp(false)}
                    onFunded={handleTopUpFunded}
                    totalMsats={preview.totalAdvertisedMsats}
                    availableMsats={payerBalanceMsats}
                    payerFederationId={paymentFederation.id}
                    payerFederationName={paymentFederation.name}
                />
            )}

            <WalletServiceJoinSheet
                show={showJoinSheet}
                onDismiss={() => setShowJoinSheet(false)}
                onJoin={handleChooseServiceToJoin}
            />
        </>
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        joinCard: {
            backgroundColor: theme.colors.offWhite100,
            borderRadius: 16,
            padding: theme.spacing.lg,
            width: '100%',
        },
        joinCardBusy: {
            // holds the footprint of the button it stands in for, so the card
            // does not resize when a join starts or falls through
            minHeight: theme.sizes.lg,
        },
        joinCardBody: {
            lineHeight: 18,
        },
        joinCardTitle: {
            fontSize: fediTheme.fontSizes.body,
            lineHeight: 22,
        },
        loadingContainer: {
            alignItems: 'center',
            gap: theme.spacing.md,
            justifyContent: 'center',
        },
        payDisabled: {
            backgroundColor: theme.colors.grey,
        },
        payDisabledTitle: {
            color: theme.colors.white,
        },
        summary: {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
        },
    })

export default ConfirmWalletService
