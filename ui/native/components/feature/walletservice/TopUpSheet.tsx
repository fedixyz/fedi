import { Text, Theme, useTheme } from '@rneui/themed'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppState, StyleSheet } from 'react-native'

import { theme as fediTheme } from '@fedi/common/constants/theme'
import { useAmountFormatter } from '@fedi/common/hooks/amount'
import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { refreshFederations, selectLoadedFederations } from '@fedi/common/redux'
import { LoadedFederation, MSats, Sats } from '@fedi/common/types'
import { makeLog } from '@fedi/common/utils/log'
import { coerceTxn } from '@fedi/common/utils/transaction'

import { useAppDispatch, useAppSelector } from '../../../state/hooks'
import AmountInput from '../../ui/AmountInput'
import CustomOverlay, { CustomOverlayContents } from '../../ui/CustomOverlay'
import { Eyebrow } from '../../ui/Eyebrow'
import { Column } from '../../ui/Flex'
import QRCodeContainer from '../../ui/QRCodeContainer'
import { ScreenTitle } from '../../ui/ScreenTitle'
import { SelectableOptionCard } from '../../ui/SelectableOptionCard'
import { SheetHandle } from '../../ui/SheetHandle'
import { SUCCESS_PILL_GREEN, SUCCESS_PILL_GREEN_BG } from '../../ui/SuccessPill'
import SvgImage from '../../ui/SvgImage'
import { FederationLogo } from '../federations/FederationLogo'
import { MilestoneSpinner } from './MilestoneSpinner'
import { WalletServiceFederationRow } from './WalletServiceFederationRow'

const log = makeLog('TopUpSheet')

/** Deposits are asked for in round numbers, never in exact-shortfall dust. */
const TOP_UP_ROUNDING_SATS = 1_000

/**
 * The least a top-up may exceed the shortfall by, so the receive fee cannot
 * eat the whole margin and leave the wallet short. See `roundUpTopUpSats`.
 */
const TOP_UP_MIN_HEADROOM_SATS = 100

/** Sentinel for "deposit over Lightning", which is not one of the wallets. */
const EXTERNAL_SOURCE = 'external' as const

/**
 * How often to re-read the payer's transactions while the invoice is on screen.
 *
 * A local bridge database read, not a network call, so the interval can be
 * short. It only runs while the invoice view is on screen and the app is in
 * the foreground, so it is bounded by the user actually waiting on a QR code.
 */
const INVOICE_POLL_INTERVAL_MS = 5000

/** How many transactions to look back over for our own invoice. */
const INVOICE_POLL_LOOKBACK = 10

/** The source list is a snapshot: a wallet can drop out of `ready` mid-flow. */
type TopUpSource = {
    id: string
    name: string
    inviteCode: string
    balanceMsats: MSats
    /** Carried for the row's logo, which reads the icon out of the meta. */
    meta: LoadedFederation['meta']
}

type SelectedSource = TopUpSource | typeof EXTERNAL_SOURCE | null

const isFederationSource = (source: SelectedSource): source is TopUpSource =>
    source !== null && source !== EXTERNAL_SOURCE

type TopUpView = 'amount' | 'source' | 'moving' | 'invoice' | 'join'

export interface TopUpSheetProps {
    show: boolean
    onDismiss: () => void
    /**
     * Funding landed. The sheet never pays for setup itself — the caller
     * returns to the confirm screen so the user re-approves the spend.
     */
    onFunded: () => void
    /** Decimal msat strings, exactly as they cross the bridge. */
    totalMsats: string
    availableMsats: string
    payerFederationId: string
    payerFederationName: string
}

/**
 * The shortfall, rounded up to a round number, with room to spare on top.
 *
 * A deposit does not arrive whole: the lightning module charges a `receivePpm`,
 * so what lands is a little under what was asked for. Against that,
 * `selectCanPayForWalletService` wants `balance >= totalAdvertisedMsats` with
 * no tolerance at all. Ask for exactly the shortfall and the wallet lands a few
 * sats short, the banner still says "not enough funds", and the transfer looks
 * to the user like it moved the wrong amount.
 *
 * Rounding to the *nearest* thousand left that to luck: it gave 1–999 sats of
 * slack for most shortfalls and none at all for a round one — a 21,000-sat
 * setup cost against an empty wallet asked for exactly 21,000 and came up short
 * every single time.
 *
 * So the headroom is guaranteed instead of incidental: round up, then take
 * another step if that left less than `TOP_UP_MIN_HEADROOM_SATS`. A fee in the
 * parts-per-million on a five-figure sat amount is tens of sats, so 100 covers
 * it with room, and the ask stays a number the user recognises.
 */
export const roundUpTopUpSats = (sats: number): Sats => {
    const owed = Math.max(0, sats)
    const rounded =
        (Math.floor(owed / TOP_UP_ROUNDING_SATS) + 1) * TOP_UP_ROUNDING_SATS
    const withHeadroom =
        rounded - owed < TOP_UP_MIN_HEADROOM_SATS
            ? rounded + TOP_UP_ROUNDING_SATS
            : rounded
    return withHeadroom as Sats
}

/**
 * How much to ask for. msats are u64 decimal strings on the bridge, so the
 * subtraction has to happen in BigInt, not Number.
 */
const useTopUpShortfall = (totalMsats: string, availableMsats: string) =>
    useMemo(() => {
        const total = BigInt(totalMsats)
        const available = BigInt(availableMsats)
        const missing = total > available ? total - available : BigInt(0)
        // round msats up to whole sats so we never ask for less than is owed
        const missingSats = Number((missing + BigInt(999)) / BigInt(1000))
        return {
            suggestedSats: roundUpTopUpSats(missingSats),
        }
    }, [totalMsats, availableMsats])

/**
 * Other wallets that could fund the top-up in one move. A wallet that can only
 * cover part of the amount is not offered — a partial transfer leaves the user
 * short on both sides.
 *
 * Best-funded first, so the From row can default to the wallet least likely to
 * be emptied by the transfer.
 */
const useTopUpSources = (
    federations: LoadedFederation[],
    amountSats: Sats,
    excludeFederationId: string,
) =>
    useMemo(() => {
        const amountMsats = amountSats * 1000
        return federations
            .filter(f => f.id !== excludeFederationId)
            .filter(f => f.balance >= amountMsats)
            .map<TopUpSource>(f => ({
                id: f.id,
                name: f.name,
                inviteCode: f.inviteCode,
                balanceMsats: f.balance,
                meta: f.meta,
            }))
            .sort((a, b) => b.balanceMsats - a.balanceMsats)
    }, [federations, excludeFederationId, amountSats])

const TopUpSheet: React.FC<TopUpSheetProps> = ({
    show,
    onDismiss,
    onFunded,
    totalMsats,
    availableMsats,
    payerFederationId,
    payerFederationName,
}) => {
    const { theme } = useTheme()
    const { t } = useTranslation()
    const fedimint = useFedimint()
    const toast = useToast()
    const dispatch = useAppDispatch()
    const { suggestedSats } = useTopUpShortfall(totalMsats, availableMsats)
    const [amount, setAmount] = useState<Sats>(suggestedSats)
    const [view, setView] = useState<TopUpView>('amount')

    // the whole source is held, not just its id, so the join check below
    // compares a snapshot taken at selection time against the wallets that are
    // loaded now
    const [selectedSource, setSelectedSource] = useState<SelectedSource>(null)
    const [invoice, setInvoice] = useState<string | null>(null)
    const [isWorking, setIsWorking] = useState(false)
    // guards `settleFunding`, defined below with the four checks that share it
    const hasFunded = useRef(false)

    /**
     * Every open starts the sheet over.
     *
     * The sheet mounts once with the screen and is only hidden between uses, so
     * without this it reopens wherever it was left: a second Top up landed
     * straight back on "Funds moved" from the first, over a stale invoice the
     * transaction listener was still watching. Nothing here is worth carrying
     * across — the payer, and so the shortfall, can change between opens, which
     * is why a prefill frozen at mount time offered the 1,000-sat floor against
     * a 21,000-sat gap.
     *
     * `selectedSource` resets to null rather than to a wallet: the effect below
     * re-picks the best-funded source that covers the new amount.
     */
    useEffect(() => {
        if (!show) return
        setAmount(suggestedSats)
        setView('amount')
        setSelectedSource(null)
        setInvoice(null)
        setIsWorking(false)
        // the latch is per-use, not per-mount: the sheet outlives each open, so
        // a second top-up would find funding already "settled" by the first
        hasFunded.current = false
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show])
    const loadedFederations = useAppSelector(selectLoadedFederations)
    const sources = useTopUpSources(
        loadedFederations,
        amount,
        payerFederationId,
    )
    const { makeFormattedAmountsFromMSats } = useAmountFormatter({
        federationId: payerFederationId,
    })
    // carried for the To row's logo, which reads the icon out of the meta
    const payerFederation = loadedFederations.find(
        f => f.id === payerFederationId,
    )

    // The From row defaults rather than starting empty: in the common case one
    // wallet covers the shortfall and the user only has to press Send. The
    // selection is re-checked whenever the list changes, because editing the
    // amount can drop the chosen wallet out of full coverage.
    useEffect(() => {
        if (selectedSource === EXTERNAL_SOURCE) return
        const isStillOffered =
            isFederationSource(selectedSource) &&
            sources.some(s => s.id === selectedSource.id)
        if (isStillOffered) return
        setSelectedSource(sources[0] ?? null)
    }, [sources, selectedSource])

    // setup is priced in sats whatever the wallet displays by default, so the
    // balances beside each wallet stay in sats rather than half-converting
    const formatMsats = useCallback(
        (msats: string | MSats) =>
            makeFormattedAmountsFromMSats(Number(msats) as MSats).formattedSats,
        [makeFormattedAmountsFromMSats],
    )

    const amountMsats = (amount * 1000) as MSats

    // the deposit always lands in the wallet that pays for setup
    const generateTopUpInvoice = useCallback(
        () =>
            fedimint.generateInvoice(
                amountMsats,
                t('phrases.wallet-service'),
                payerFederationId,
                null,
            ),
        [fedimint, amountMsats, t, payerFederationId],
    )

    const moveFundsFrom = useCallback(
        async (source: TopUpSource) => {
            setView('moving')
            setIsWorking(true)
            try {
                const bolt11 = await generateTopUpInvoice()
                await fedimint.payInvoice(bolt11, source.id)
            } catch (error) {
                log.error('moveFundsFrom', error)
                toast.error(t, error)
                setView('source')
            } finally {
                setIsWorking(false)
            }
        },
        [fedimint, generateTopUpInvoice, toast, t],
    )

    /**
     * The invoice is in hand before the view changes, never after.
     *
     * Flipping the view first put the wait inside the QR frame: the sheet
     * showed an empty box with a spinner in it for the whole `generateInvoice`
     * round trip, which reads as "the QR code is slow". The wallet tab's
     * Request flow takes the same round trip and does not, because it holds the
     * amount screen with the spinner in the button and only navigates once the
     * invoice exists — so the QR screen paints its code on the first frame.
     *
     * This does the same. `isWorking` drives the sheet's own button spinner, so
     * the wait reads as "submitting" on the surface that was pressed. A failure
     * leaves the user on the amount view they pressed from, which is why there
     * is no `setView` in the catch any more.
     */
    const startExternalDeposit = useCallback(async () => {
        setIsWorking(true)
        try {
            const bolt11 = await generateTopUpInvoice()
            setInvoice(bolt11)
            setView('invoice')
        } catch (error) {
            log.error('startExternalDeposit', error)
            toast.error(t, error)
        } finally {
            setIsWorking(false)
        }
    }, [generateTopUpInvoice, toast, t])

    /**
     * Funding is detected four ways, and only the first one to notice counts.
     *
     * The listener below is an *edge*: one `transaction` event, matched on an
     * exact invoice string. Backgrounding the app to pay the invoice — which is
     * the ordinary way to pay it — suspends the JS thread, so the bridge emits
     * that event into a sink nothing is draining, and the edge is gone. Nothing
     * re-derived the state afterwards, so the sheet sat on the QR code forever
     * and the only way out was the "I've paid" button.
     *
     * So the edge is backed by a *level* (the balance), a *repair* (a resync on
     * resume, for when the balance event was dropped along with the
     * transaction one) and a *backstop* (a slow poll of the payer's own
     * transactions). All four converge on this one latch, because `onFunded`
     * closes the sheet and re-quotes the price: called twice it would fire a
     * second selection RPC against a sheet that is already gone.
     *
     * The latch is a ref rather than state on purpose — two of these paths can
     * resolve in the same tick, and render state is still false in that tick.
     */
    const settleFunding = useCallback(() => {
        if (hasFunded.current) return
        hasFunded.current = true
        onFunded()
    }, [onFunded])

    // ① the edge: instant, whenever the app is awake to hear it
    useEffect(() => {
        if (!show || view !== 'invoice' || !invoice) return
        return fedimint.addListener('transaction', ({ transaction }) => {
            const tx = coerceTxn(transaction)
            if (
                tx.kind === 'lnReceive' &&
                tx.ln_invoice === invoice &&
                tx.state?.type === 'claimed'
            )
                settleFunding()
        })
    }, [show, view, invoice, fedimint, settleFunding])

    /**
     * ② the level: the wallet can now cover setup, however that came about.
     *
     * `availableMsats` is the payer's *live* balance, handed down from
     * `selectFederationBalance` on the confirm screen, so this needs no RPC of
     * its own — it re-evaluates whenever a balance event lands.
     *
     * Compared against the full setup cost rather than against the invoice
     * amount: the sheet's job is to get the wallet to where it can pay, and
     * that is the only threshold that means anything to the screen behind it.
     * It also makes an accidental advance impossible — if the balance really
     * does cover the total, funding is done by definition, whatever paid for it.
     */
    useEffect(() => {
        if (!show || view !== 'invoice') return
        if (BigInt(availableMsats) >= BigInt(totalMsats)) settleFunding()
    }, [show, view, availableMsats, totalMsats, settleFunding])

    /**
     * ③ the repair: re-read balances from the bridge on the way back in.
     *
     * A suspended JS thread misses the `balance` event as readily as the
     * `transaction` one, and ② can only fire on a balance the store knows
     * about. This re-reads them, which lets ② decide on fact rather than on
     * whatever survived the suspension.
     */
    // Deliberately not `useAppIsInForeground`: that hook also calls
    // `fedimint.onAppForeground()` on the bridge singleton it imports directly,
    // which is an app-lifecycle concern this sheet has no business repeating.
    const [isForeground, setIsForeground] = useState(
        AppState.currentState === 'active',
    )
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextState =>
            setIsForeground(nextState === 'active'),
        )
        return () => subscription.remove()
    }, [])

    useEffect(() => {
        if (!show || view !== 'invoice' || !isForeground) return
        dispatch(refreshFederations(fedimint))
    }, [show, view, isForeground, dispatch, fedimint])

    /**
     * ④ the backstop: ask the payer's own transaction list.
     *
     * This is the only check that names the invoice, so it is the one that
     * still works when the balance is unreadable for some other reason. A local
     * database read, and it runs only while the user is actually watching the
     * QR code with the app in front of them.
     */
    useEffect(() => {
        if (!show || view !== 'invoice' || !invoice || !isForeground) return
        let isCancelled = false
        const checkForPayment = async () => {
            try {
                const transactions = await fedimint.listTransactions(
                    payerFederationId,
                    undefined,
                    INVOICE_POLL_LOOKBACK,
                )
                if (isCancelled) return
                // the list now arrives as per-entry Results; an Err entry is a
                // transaction the bridge could not render, not a failed deposit
                const isPaid = transactions.some(entry => {
                    if (!('Ok' in entry)) return false
                    const tx = entry.Ok
                    return (
                        tx.kind === 'lnReceive' &&
                        tx.ln_invoice === invoice &&
                        tx.state?.type === 'claimed'
                    )
                })
                if (isPaid) settleFunding()
            } catch (error) {
                // a failed poll is not a failed deposit: the other three checks
                // are still watching, so this stays out of the user's way
                log.warn('invoice poll', error)
            }
        }
        const timer = setInterval(checkForPayment, INVOICE_POLL_INTERVAL_MS)
        return () => {
            isCancelled = true
            clearInterval(timer)
        }
    }, [
        show,
        view,
        invoice,
        isForeground,
        fedimint,
        payerFederationId,
        settleFunding,
    ])

    /**
     * The one commit point of the From/To surface (decision ④, 21 Aug). V3.5
     * moved the funds the moment a row was tapped; an irreversible transfer
     * does not fire from a row tap with no confirm, so it fires from here.
     */
    const handleSend = useCallback(() => {
        if (!isFederationSource(selectedSource)) {
            startExternalDeposit()
            return
        }
        // a wallet can leave `ready` while the sheet is open, and an unjoined
        // wallet cannot be told to pay anything
        if (!loadedFederations.some(f => f.id === selectedSource.id)) {
            setView('join')
            return
        }
        moveFundsFrom(selectedSource)
    }, [selectedSource, loadedFederations, startExternalDeposit, moveFundsFrom])

    const handleJoin = useCallback(async () => {
        if (!isFederationSource(selectedSource)) return
        setIsWorking(true)
        try {
            await fedimint.federationPreview(selectedSource.inviteCode)
            await fedimint.joinFederation(selectedSource.inviteCode, false)
            await moveFundsFrom(selectedSource)
        } catch (error) {
            log.error('handleJoin', error)
            toast.error(t, error)
            setView('source')
        } finally {
            setIsWorking(false)
        }
    }, [fedimint, selectedSource, moveFundsFrom, toast, t])

    const style = styles(theme)

    /**
     * The sheet's own title block. `CustomOverlay` centres a 16px title, where
     * the design leads each view with a left-aligned 20/500 line over a 12/400
     * explanation, so both are handed over as the title node.
     */
    const buildSheetHeader = (title: string, subtitle?: string) => (
        <Column fullWidth gap="xs">
            <SheetHandle />
            <ScreenTitle>{title}</ScreenTitle>
            {subtitle && <Text style={style.sheetSubtitle}>{subtitle}</Text>}
        </Column>
    )

    /** The Bolt tile that stands in for a logo on the external-deposit rows. */
    const externalAdornment = (
        <Column align="center" justify="center" style={style.externalLogo}>
            <SvgImage name="Bolt" size="sm" />
        </Column>
    )

    /**
     * One From/To surface (decision ②, 21 Aug). To is fixed — the payer is
     * predetermined by the confirm screen — and only From is selectable.
     */
    const buildAmountContents = (): CustomOverlayContents => {
        const isMovingBetweenWallets = isFederationSource(selectedSource)
        return {
            title: buildSheetHeader(t('feature.wallet-service.topup-title')),
            // No receipt above this: `AmountInput` brings its own keypad, and
            // three summary rows pushed it past the bottom of the sheet. The
            // same three numbers are already on the screen behind — the banner
            // names the wallet, what it holds and what is needed — and the
            // amount below is prefilled with the difference.
            body: (
                // tight gaps: `AmountInput`'s keypad is the tallest thing in
                // the sheet and every point above it comes off the bottom row.
                // `shrink` carries the sheet's height limit down to the keypad,
                // which sizes itself to what is left — RN defaults flexShrink
                // to 0, so without it each box keeps its natural height and the
                // bottom row falls off the end
                <Column gap="md" fullWidth shrink>
                    <Column fullWidth gap="xs">
                        <Eyebrow>{t('words.to')}</Eyebrow>
                        <WalletServiceFederationRow
                            testID="topup-destination"
                            adornment={
                                <FederationLogo
                                    federation={payerFederation}
                                    size={40}
                                />
                            }
                            name={payerFederationName}
                            detail={formatMsats(availableMsats)}
                        />
                        <Text style={style.fixedNote}>
                            {t('feature.wallet-service.topup-to-fixed')}
                        </Text>
                    </Column>

                    {/* nothing to pick between when no wallet covers the
                        amount in full, so the row is left out rather than
                        offering a choice of one */}
                    {(sources.length > 0 ||
                        selectedSource === EXTERNAL_SOURCE) && (
                        <Column fullWidth gap="xs">
                            <Eyebrow>{t('words.from')}</Eyebrow>
                            <WalletServiceFederationRow
                                testID="topup-source"
                                adornment={
                                    isFederationSource(selectedSource) ? (
                                        <FederationLogo
                                            federation={selectedSource}
                                            size={40}
                                        />
                                    ) : (
                                        externalAdornment
                                    )
                                }
                                name={
                                    isFederationSource(selectedSource)
                                        ? selectedSource.name
                                        : t(
                                              'feature.wallet-service.topup-source-external',
                                          )
                                }
                                detail={
                                    isFederationSource(selectedSource)
                                        ? formatMsats(
                                              selectedSource.balanceMsats,
                                          )
                                        : t(
                                              'feature.wallet-service.topup-source-external-detail',
                                          )
                                }
                                onPress={() => setView('source')}
                            />
                        </Column>
                    )}

                    {/* no eyebrow: the amount is the only editable thing left
                        and labelling it costs the keypad a row */}
                    <Column fullWidth grow shrink style={style.amountInput}>
                        <AmountInput
                            amount={amount}
                            onChangeAmount={setAmount}
                            federationId={payerFederationId}
                            fitNumpadToSpace
                        />
                    </Column>
                </Column>
            ),
            buttons: [
                {
                    // an internal move happens here and now, so it is named for
                    // what it does; a deposit only opens an invoice
                    text: isMovingBetweenWallets
                        ? t('words.send')
                        : t('words.continue'),
                    primary: true,
                    onPress: handleSend,
                },
            ],
        }
    }

    /**
     * The From picker. Tapping a row chooses it and returns — it does not move
     * anything, which is decision ④.
     */
    const buildSourceContents = (): CustomOverlayContents => {
        const chooseSource = (source: SelectedSource) => {
            setSelectedSource(source)
            setView('amount')
        }
        return {
            title: buildSheetHeader(
                t('feature.wallet-service.topup-source-title', {
                    amount: makeFormattedAmountsFromMSats(amountMsats)
                        .formattedSats,
                }),
                t('feature.wallet-service.topup-source-body'),
            ),
            body: (
                <Column gap="lg" fullWidth>
                    {sources.length > 0 && (
                        <Column gap="sm" fullWidth>
                            <Eyebrow>
                                {t(
                                    'feature.wallet-service.topup-source-internal-eyebrow',
                                )}
                            </Eyebrow>
                            {sources.map(source => (
                                <SelectableOptionCard
                                    key={source.id}
                                    testID={`topup-source-${source.id}`}
                                    label={source.name}
                                    description={formatMsats(
                                        source.balanceMsats,
                                    )}
                                    adornment={
                                        <FederationLogo
                                            federation={source}
                                            size={40}
                                        />
                                    }
                                    isSelected={
                                        isFederationSource(selectedSource) &&
                                        selectedSource.id === source.id
                                    }
                                    onPress={() => chooseSource(source)}
                                />
                            ))}
                        </Column>
                    )}
                    <Column gap="sm" fullWidth>
                        <Eyebrow>
                            {t(
                                'feature.wallet-service.topup-source-external-eyebrow',
                            )}
                        </Eyebrow>
                        <SelectableOptionCard
                            testID="topup-source-external"
                            label={t(
                                'feature.wallet-service.topup-source-external',
                            )}
                            description={t(
                                'feature.wallet-service.topup-source-external-detail',
                            )}
                            adornment={externalAdornment}
                            isSelected={selectedSource === EXTERNAL_SOURCE}
                            onPress={() => chooseSource(EXTERNAL_SOURCE)}
                        />
                    </Column>
                </Column>
            ),
            buttons: [
                {
                    text: t('words.cancel'),
                    onPress: () => setView('amount'),
                },
            ],
        }
    }

    const buildMovingContents = (): CustomOverlayContents => ({
        // no title while moving or moved: the tick and its caption carry the
        // whole state, and a heading above them restated the sheet's name
        title: <SheetHandle />,
        body: (
            <Column
                align="center"
                gap="lg"
                fullWidth
                style={style.transferStatus}>
                {isWorking ? (
                    // the journey's own ring, not the platform's spokes. Boxed
                    // to the success mark's size so the swap to the tick does
                    // not move the caption under it
                    <Column
                        align="center"
                        justify="center"
                        style={style.successMark}>
                        <MilestoneSpinner />
                    </Column>
                ) : (
                    // the same success mark the progress screen ends on, so
                    // "done" reads the same wherever the flow says it
                    <Column
                        align="center"
                        justify="center"
                        style={[style.successMark, style.successMarkFilled]}>
                        <SvgImage
                            name="Check"
                            size={28}
                            color={SUCCESS_PILL_GREEN}
                        />
                    </Column>
                )}
                {isWorking ? (
                    <Text style={style.transferStatusText}>
                        {t('feature.wallet-service.topup-moving')}
                    </Text>
                ) : (
                    <Column align="center" gap="xs">
                        <Text
                            style={[
                                style.transferStatusText,
                                style.transferStatusMovedTitle,
                            ]}>
                            {t('feature.wallet-service.topup-moved')}
                        </Text>
                        <Text style={style.transferStatusDetail}>
                            {t('feature.wallet-service.topup-moved-detail', {
                                amount: makeFormattedAmountsFromMSats(
                                    amountMsats,
                                    'none',
                                ).formattedSats,
                                federation: payerFederationName,
                            })}
                        </Text>
                    </Column>
                )}
            </Column>
        ),
        // the transfer cannot be cancelled halfway, so there is nothing to offer
        // until it settles
        buttons: isWorking
            ? []
            : [
                  {
                      text: t('words.continue'),
                      primary: true,
                      onPress: settleFunding,
                  },
              ],
    })

    const buildInvoiceContents = (): CustomOverlayContents => {
        const depositAmounts = makeFormattedAmountsFromMSats(amountMsats)
        return {
            title: buildSheetHeader(
                t('feature.wallet-service.topup-source-external'),
            ),
            body: (
                <Column align="center" gap="md" fullWidth>
                    <Column align="center">
                        <Text style={style.depositLabel}>
                            {t('words.deposit')}
                        </Text>
                        <Text style={style.depositAmount}>
                            {depositAmounts.formattedSats}
                        </Text>
                        <Text style={style.depositFiat}>
                            {depositAmounts.formattedFiat}
                        </Text>
                    </Column>
                    {/* a null check, not a loading state: the view is only
                        entered with the invoice already in hand */}
                    {invoice && (
                        <QRCodeContainer
                            qrValue={invoice}
                            copyValue={invoice}
                            copyMessage={t('phrases.copied-to-clipboard')}
                            showTextWithAction="copy"
                        />
                    )}
                    <Text style={style.waitingText}>
                        {t('feature.wallet-service.topup-waiting')}
                    </Text>
                </Column>
            ),
            buttons: [
                {
                    // the settled deposit advances the sheet on its own (the
                    // transaction listener above); this is the escape hatch for
                    // a payment the listener missed, and it only re-checks the
                    // balance, so a premature press cannot fake funding
                    text: t('feature.wallet-service.topup-ive-paid'),
                    primary: true,
                    onPress: settleFunding,
                },
            ],
        }
    }

    const buildJoinContents = (): CustomOverlayContents => ({
        title: buildSheetHeader(
            t('feature.wallet-service.topup-join-title'),
            t('feature.wallet-service.topup-join-body', {
                federation: isFederationSource(selectedSource)
                    ? selectedSource.name
                    : '',
            }),
        ),
        buttons: [
            { text: t('words.cancel'), onPress: () => setView('source') },
            {
                text: t('words.join'),
                primary: true,
                disabled: isWorking,
                onPress: handleJoin,
            },
        ],
    })

    const contentsByView: Record<TopUpView, () => CustomOverlayContents> = {
        amount: buildAmountContents,
        source: buildSourceContents,
        moving: buildMovingContents,
        invoice: buildInvoiceContents,
        join: buildJoinContents,
    }

    return (
        <CustomOverlay
            show={show}
            onBackdropPress={onDismiss}
            // spins the primary button and locks the sheet while an RPC is out.
            // The external-deposit path awaits its invoice here rather than on
            // the invoice view, so this is the surface that shows that wait.
            loading={isWorking}
            // the amount view's keypad must not scroll: at the default height
            // its bottom row sits behind the pinned button
            tall={view === 'amount'}
            contents={contentsByView[view]()}
        />
    )
}

const styles = (theme: Theme) =>
    StyleSheet.create({
        amountInput: {
            minHeight: theme.sizes.xl * 2,
        },
        depositAmount: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.h2,
            fontWeight: '500',
            lineHeight: 29,
        },
        depositFiat: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            lineHeight: 20,
        },
        depositLabel: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.caption,
            fontWeight: '500',
            lineHeight: 20,
        },
        fixedNote: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
        externalLogo: {
            backgroundColor: theme.colors.grey100,
            borderRadius: 10,
            height: 40,
            width: 40,
        },
        sheetSubtitle: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
        // the shared box: the ring waits in it and the tick lands in it, so the
        // caption below sits at one height for both
        successMark: {
            borderRadius: 999,
            height: 56,
            width: 56,
        },
        // only the tick earns the green disc; a ring on it would read as done
        // while the transfer is still running
        successMarkFilled: {
            backgroundColor: SUCCESS_PILL_GREEN_BG,
        },
        transferStatus: {
            paddingVertical: theme.spacing.lg,
        },
        transferStatusText: {
            color: theme.colors.primary,
            fontSize: fediTheme.fontSizes.body,
            fontWeight: '600',
            textAlign: 'center',
        },
        transferStatusDetail: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.caption,
            textAlign: 'center',
        },
        transferStatusMovedTitle: {
            fontWeight: '700',
        },
        waitingText: {
            color: theme.colors.darkGrey,
            fontSize: fediTheme.fontSizes.small,
            lineHeight: 16,
        },
    })

export default TopUpSheet
