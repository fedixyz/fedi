import type {
    GuardianStatus,
    RpcFaGuardianTransfer,
    RpcFaGuardianTransferPhase,
    RpcFaOperationError,
    RpcFaReplacementCheck,
    RpcFaReplacementReason,
} from '@fedi/common/types/bindings'

import { formedAt, formedStatus, simMgName } from '../status'
import {
    FaScript,
    FaScriptContext,
    StubHandler,
    act,
    candidates,
    checkpoint,
    formWalletService,
    script,
    stream,
    stub,
    wait,
} from '../steps'

/** The seat every review scenario opens on, the third guardian. */
export const TRANSFER_SEAT_INDEX = 2

const PRICED_MSATS = '2100000'

// above every mock payer's balance, so the review asks for a top-up
const UNAFFORDABLE_MSATS = '2000000000'

const HOSTS = {
    first: { mgId: 'mg_transfer_destination', mgName: 'quiet-harbor' },
    second: { mgId: 'mg_transfer_second', mgName: 'steady-wren' },
}

const inPhase = (
    phase: RpcFaGuardianTransferPhase,
): Pick<RpcFaGuardianTransfer, 'phase' | 'destinationSeatId'> => ({
    phase,
    destinationSeatId: phase === 'buyingSeat' ? null : 'seat_new',
})

const transferAt = (
    phase: RpcFaGuardianTransferPhase,
    seatIndex = TRANSFER_SEAT_INDEX,
): RpcFaGuardianTransfer => ({
    seatIndex,
    sourceMgId: `mg_transfer_source_${seatIndex}`,
    sourceMgName: simMgName(seatIndex),
    sourceSeatId: `seat_${seatIndex}`,
    destinationMgId: HOSTS.first.mgId,
    destinationMgName: HOSTS.first.mgName,
    ...inPhase(phase),
})

const HOUR_SECS = 60 * 60

/** What the check found on the guardian the scenarios replace. */
const UNRELIABLE_REASONS: RpcFaReplacementReason[] = [
    { type: 'offline', lastSeenSecs: 0 },
    { type: 'lowWeekScore', basisPoints: 6_240 },
    { type: 'lowMonthScore', basisPoints: 8_130 },
]

/** What the check found on any other guardian it flags. */
const MISSED_SESSION_REASONS: RpcFaReplacementReason[] = [
    { type: 'offline', lastSeenSecs: 0 },
    { type: 'missedSessions', sessions: 14 },
]

/**
 * A replacement check that flags `seats` of the formed federation, named as
 * the guardian list names them. `null` seats means no check has finished.
 */
const checkFlagging =
    (seats: number[] | null) =>
    (ctx: FaScriptContext): RpcFaReplacementCheck | null => {
        if (!seats) return null
        const now = Math.floor(Date.now() / 1000)
        return {
            federationId: 'sim-federation',
            checkedAt: now - HOUR_SECS / 4,
            blockingLiquidityOperation: null,
            candidates: formedAt(ctx)
                .seats.map((seat, index) => ({ seat, index }))
                .filter(({ index }) => seats.includes(index))
                .map(({ seat, index }) => ({
                    seatIndex: index,
                    mgId: seat.mgId,
                    mgName: seat.mgName,
                    reasons: (index === TRANSFER_SEAT_INDEX
                        ? UNRELIABLE_REASONS
                        : MISSED_SESSION_REASONS
                    ).map(reason =>
                        reason.type === 'offline'
                            ? {
                                  ...reason,
                                  lastSeenSecs: now - 3 * 24 * HOUR_SECS,
                              }
                            : reason,
                    ),
                })),
        }
    }

const previewAt =
    (
        advertisedPriceMsats: string,
        {
            host = HOSTS.first,
            validForSecs = 600,
            delayMs = 0,
        }: {
            host?: { mgId: string; mgName: string }
            validForSecs?: number
            /** Long enough to see the review's "Updating quote…" state. */
            delayMs?: number
        } = {},
    ): StubHandler =>
    async () => {
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
        return {
            type: 'preview',
            preview: {
                previewId: `sim-transfer-preview-${host.mgId}`,
                ...host,
                advertisedPriceMsats,
                provenance: 'registry',
                validUntil: Math.floor(Date.now() / 1000) + validForSecs,
            },
        }
    }

/**
 * Answer each call with the next handler, repeating the last one.
 *
 * Counted per run: the script outlives a jump, and a second jump to the same
 * screen has to start from the first answer again.
 */
const inTurn = (...handlers: StubHandler[]): StubHandler => {
    let run: string | null = null
    let call = 0
    return (payload, ctx) => {
        if (ctx.formationId !== run) {
            run = ctx.formationId
            call = 0
        }
        return handlers[Math.min(call++, handlers.length - 1)](payload, ctx)
    }
}

const failWith =
    (error: RpcFaOperationError): StubHandler =>
    () => ({ type: 'error', error })

/** Every guardian online except `offline`, by seat index. */
const guardiansNotResponding =
    (offline: number[]): StubHandler =>
    (_payload, ctx) =>
        formedAt(ctx).seats.map(
            (seat, index): GuardianStatus =>
                offline.includes(index)
                    ? {
                          timeout: {
                              guardian: `peer ${index}`,
                              mg_name: seat.mgName,
                              elapsed: '10s',
                          },
                      }
                    : {
                          online: {
                              guardian: `peer ${index}`,
                              mg_name: seat.mgName,
                              latency_ms: 40,
                          },
                      },
        )

/** Every guardian online except the one the review scenarios replace. */
const oneGuardianNotResponding = guardiansNotResponding([TRANSFER_SEAT_INDEX])

/** How long the full run holds each phase, long enough to read the step. */
const TRANSFER_PHASE_MS = 4_000

type TransferScriptOptions = {
    /** The open move the transfer stream reports when the screen opens. */
    initial?: RpcFaGuardianTransferPhase
    /**
     * The phases the stream reports after `initial`, one every
     * {@link TRANSFER_PHASE_MS}. Ending on `completed` also puts the new
     * host in the seat and clears the replacement check.
     */
    advancesTo?: RpcFaGuardianTransferPhase[]
    preview?: StubHandler
    /** Replaces the default start answer, the move waiting for the old host. */
    start?: StubHandler
    /** What the dashboard's guardian list reads, when it matters. */
    guardianStatus?: StubHandler
    /** Seats the replacement check flags; `null` for no check yet. */
    flagged?: number[] | null
}

/**
 * A formed Federation and canned bridge answers for a guardian replacement.
 *
 * The transfer stream reports the move the scenario names. Only the full run
 * advances it on a timer, after the checkpoint. A start reports and answers
 * what the bridge's start returns once its run stops to wait for the old host.
 */
const transferScript = (
    name: string,
    {
        initial,
        advancesTo = [],
        preview = previewAt(PRICED_MSATS),
        start,
        guardianStatus,
        flagged = [TRANSFER_SEAT_INDEX],
    }: TransferScriptOptions = {},
): FaScript => {
    // the seat the last preview was for, which the start's answer names
    let previewedSeat = TRANSFER_SEAT_INDEX

    const defaultStart: StubHandler = (_payload, ctx) => {
        const started = transferAt('awaitingSource', previewedSeat)
        ctx.world.setGuardianTransfer(started)
        return { type: 'transfer', transfer: started }
    }

    return script(name, [
        act(ctx => {
            previewedSeat = TRANSFER_SEAT_INDEX
            ctx.world.setGuardianTransfer(initial ? transferAt(initial) : null)
        }),
        stream(ctx => formedStatus(formedAt(ctx))),
        // before the join: the app reads guardian status as the federation
        // lands and caches that answer, so the dashboard's own read is skipped
        ...(guardianStatus ? [stub('getGuardianStatus', guardianStatus)] : []),
        formWalletService('ready'),
        candidates(checkFlagging(flagged)),
        stub('faClientPreviewTransferDestination', (payload, ctx) => {
            previewedSeat = payload.seatIndex as number
            return preview(payload, ctx)
        }),
        stub('faClientStartGuardianTransfer', start ?? defaultStart),
        checkpoint('transfer'),
        ...advancesTo.flatMap(phase => [
            wait(TRANSFER_PHASE_MS),
            act(ctx => ctx.world.setGuardianTransfer(transferAt(phase))),
        ]),
        // a completed move has put the new host in the seat
        ...(advancesTo.at(-1) === 'completed'
            ? [
                  stream(ctx => formedStatus(reboundFederation(ctx))),
                  candidates(checkFlagging([])),
              ]
            : []),
    ])
}

/** The formed federation after the move: the new host holds the seat. */
const reboundFederation = (ctx: FaScriptContext) => {
    const federation = formedAt(ctx)
    return {
        ...federation,
        seats: federation.seats.map((seat, index) =>
            index === TRANSFER_SEAT_INDEX ? { ...seat, ...HOSTS.first } : seat,
        ),
    }
}

// entry
export const transferSettingsEntry = transferScript('transfer.settingsEntry')
export const transferSheetEntry = transferScript('transfer.sheetEntry', {
    guardianStatus: oneGuardianNotResponding,
})
export const transferPick = transferScript('transfer.pick')

// review
// the search never answers, so the review stays on its loading state
export const transferSearching = transferScript('transfer.searching', {
    preview: () => new Promise(() => {}),
})
export const transferReviewPriced = transferScript('transfer.reviewPriced')
export const transferReviewFree = transferScript('transfer.reviewFree', {
    preview: previewAt('0'),
})
export const transferQuoteExpiring = transferScript('transfer.quoteExpiring', {
    preview: inTurn(
        previewAt(PRICED_MSATS, { validForSecs: 5 }),
        previewAt(PRICED_MSATS, { delayMs: 2_000 }),
    ),
})

// errors
export const transferNotEnoughFunds = transferScript(
    'transfer.notEnoughFunds',
    { preview: previewAt(UNAFFORDABLE_MSATS) },
)
export const transferHostChanged = transferScript('transfer.hostChanged', {
    preview: inTurn(
        previewAt(PRICED_MSATS, { validForSecs: 5 }),
        previewAt('2350000', { host: HOSTS.second, delayMs: 1_000 }),
    ),
})
export const transferNoFreeHost = transferScript('transfer.noFreeHost', {
    preview: inTurn(
        failWith({
            code: 'selection',
            message: 'no verified host has a free seat',
            detail: {
                type: 'insufficientMgSeats',
                requested: 1,
                selected: 0,
                seen: 3,
                eligible: 0,
            },
        }),
        previewAt(PRICED_MSATS),
    ),
})
export const transferStartBusy = transferScript('transfer.startBusy', {
    start: failWith({
        code: 'busy',
        message: 'the bridge is finishing another change',
        detail: null,
    }),
})
export const transferPaymentFails = transferScript('transfer.paymentFails', {
    start: failWith({
        code: 'payment',
        message: 'the seat payment did not go through',
        detail: null,
    }),
})
// the setup-payment policy does not enable guardian transfer yet
export const transferUnavailable = transferScript('transfer.unavailable', {
    start: failWith({
        code: 'capabilityUnavailable',
        message: 'the setup-payment policy does not enable guardian transfer',
        detail: null,
    }),
})

// progress
export const transferBuyingSeat = transferScript('transfer.buyingSeat', {
    initial: 'buyingSeat',
})
export const transferAwaitingSource = transferScript(
    'transfer.awaitingSource',
    { initial: 'awaitingSource' },
)
export const transferPublishingBinding = transferScript(
    'transfer.publishingBinding',
    { initial: 'publishingBinding' },
)
export const transferRemovingSource = transferScript(
    'transfer.removingSource',
    { initial: 'removingSource' },
)

// done
// the stream reports the move one step further on at a time, as the bridge
// does, and then completed
export const transferRunToDone = transferScript('transfer.runToDone', {
    initial: 'buyingSeat',
    advancesTo: [
        'awaitingSource',
        'publishingBinding',
        'removingSource',
        'completed',
    ],
})

// replacement check
export const transferDashboardFlagged = transferScript(
    'transfer.dashboardFlagged',
    { guardianStatus: oneGuardianNotResponding },
)
export const transferDashboardFlaggedMany = transferScript(
    'transfer.dashboardFlaggedMany',
    {
        guardianStatus: guardiansNotResponding([1, TRANSFER_SEAT_INDEX]),
        flagged: [1, TRANSFER_SEAT_INDEX],
    },
)
// offline but not flagged: no Replace, as for any guardian that is only down
export const transferSheetOfflineNotFlagged = transferScript(
    'transfer.sheetOfflineNotFlagged',
    {
        guardianStatus: guardiansNotResponding([0, TRANSFER_SEAT_INDEX]),
    },
)
export const transferNoneFlagged = transferScript('transfer.noneFlagged', {
    flagged: [],
})
export const transferNotChecked = transferScript('transfer.notChecked', {
    flagged: null,
})
// the guardian recovered and the bridge dropped it before the preview
export const transferNotEligible = transferScript('transfer.notEligible', {
    preview: failWith({
        code: 'replacementNotEligible',
        message: 'the guardian is not a replacement candidate',
        detail: null,
    }),
})

// open replacement as the dashboard shows it
export const transferDashboardWaiting = transferScript(
    'transfer.dashboardWaiting',
    { initial: 'awaitingSource', guardianStatus: oneGuardianNotResponding },
)

// flag off: the screens apply the override, these only set the stage
export const transferFlagOffSettings = transferScript(
    'transfer.flagOffSettings',
)
export const transferFlagOffSheet = transferScript('transfer.flagOffSheet', {
    guardianStatus: oneGuardianNotResponding,
})
