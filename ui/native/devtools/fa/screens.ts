import type { FeatureCatalog } from '@fedi/common/types/bindings'

import {
    formationAlreadyFormed,
    formationAuthorizePayments,
    formationAuthorizePaymentsShort,
    formationCreatedJoinFails,
    formationDkgStuck,
    formationFails,
    formationFailsTerminally,
    formationGuardianDroppedOut,
    formationGuardianDroppedOutNoCandidates,
    formationHappyPath,
    formationReconnecting,
} from './scripts/formation'
import {
    lightningAlreadyAttached,
    lightningAlreadyAttaching,
    lightningAttaches,
    lightningFailsRetryable,
    lightningFailsTerminally,
    lightningNeverVerifies,
    lightningNoProvider,
    lightningRejected,
    lightningWrongNetwork,
} from './scripts/lightning'
import {
    recoveryHappyPath,
    recoveryJoinFails,
    recoverySlowJoin,
} from './scripts/recovery'
import { settingsAutojoinUnsupported } from './scripts/settings'
import {
    setupHappyPath,
    setupInsufficientBalance,
    setupJoinLookupFails,
    setupNoJoinableServices,
    setupNotEnoughGuardians,
    setupPayerLookupFails,
    setupQuoteRefreshLosesGuardians,
    setupReauthorizationRequired,
    setupSelectionExpiresFast,
    setupSlowJoinLookup,
    setupSlowNetwork,
} from './scripts/setup'
import {
    TRANSFER_SEAT_INDEX,
    transferAwaitingSource,
    transferBuyingSeat,
    transferDashboardFlagged,
    transferDashboardFlaggedMany,
    transferDashboardWaiting,
    transferNoneFlagged,
    transferNotChecked,
    transferNotEligible,
    transferSheetOfflineNotFlagged,
    transferFlagOffSettings,
    transferFlagOffSheet,
    transferHostChanged,
    transferNoFreeHost,
    transferNotEnoughFunds,
    transferPaymentFails,
    transferPick,
    transferPublishingBinding,
    transferQuoteExpiring,
    transferRemovingSource,
    transferReviewFree,
    transferReviewPriced,
    transferRunToDone,
    transferSearching,
    transferSettingsEntry,
    transferUnavailable,
    transferSheetEntry,
    transferStartBusy,
} from './scripts/transfer'
import type { FaScript } from './steps'

// string literals rather than a native import: they are checked against
// RootStackParamList where the panel calls navigate()
export type FaScreenRoute =
    | 'CreateWalletService'
    | 'ConfirmWalletService'
    | 'WalletServiceProgress'
    | 'WalletServiceDashboard'
    | 'WalletServiceReplaceReview'
    | 'WalletServiceGuardianTransfer'
    | 'WalletServiceLightningProvider'
    | 'WalletServiceSettings'
    | 'WalletServiceAutojoinSpaces'

/** A route and the params it opens with, paired so each route keeps its own. */
export type FaScreenTarget =
    | { route: 'WalletServiceSettings'; params?: { openSheet: 'provider' } }
    | { route: 'WalletServiceDashboard'; params?: { openSheet: 'guardians' } }
    | {
          route: 'WalletServiceGuardianTransfer'
          params?: { seatIndex: number }
      }
    | {
          route: Exclude<
              FaScreenRoute,
              | 'WalletServiceSettings'
              | 'WalletServiceDashboard'
              | 'WalletServiceGuardianTransfer'
          >
          params?: undefined
      }

export type FaScreen = FaScreenTarget & {
    id: string
    label: string
    script: FaScript
    checkpoint: string
    /** Catalog entries the panel forces over the bridge's own for this screen. */
    features?: Partial<FeatureCatalog>
}

export type FaScreenGroup = { title: string; screens: FaScreen[] }

const on =
    (target: FaScreenTarget) =>
    (
        id: string,
        label: string,
        script: FaScript,
        checkpoint: string,
    ): FaScreen => ({
        id,
        label,
        script,
        checkpoint,
        ...target,
    })

const create = on({ route: 'CreateWalletService' })
const confirm = on({ route: 'ConfirmWalletService' })
const progress = on({ route: 'WalletServiceProgress' })
const dashboard = on({ route: 'WalletServiceDashboard' })
const replaceReview = on({ route: 'WalletServiceReplaceReview' })
const providerScreen = (id: string, label: string, s: FaScript) =>
    on({ route: 'WalletServiceLightningProvider' })(id, label, s, 'provider')
const settings = on({
    route: 'WalletServiceSettings',
    params: { openSheet: 'provider' },
})
const autojoin = on({ route: 'WalletServiceAutojoinSpaces' })

// an installed app can carry a bridge older than the flag, so every guardian
// replacement screen forces it rather than reading it
const transferOn = (screen: FaScreen): FaScreen => ({
    ...screen,
    features: { wallet_service_guardian_transfer: {} },
})

// every guardian replacement script lands on one checkpoint
const transferSettings = (id: string, label: string, s: FaScript) =>
    transferOn(on({ route: 'WalletServiceSettings' })(id, label, s, 'transfer'))
const transferSheet = (id: string, label: string, s: FaScript) =>
    transferOn(
        on({
            route: 'WalletServiceDashboard',
            params: { openSheet: 'guardians' },
        })(id, label, s, 'transfer'),
    )
const transferList = (id: string, label: string, s: FaScript) =>
    transferOn(
        on({ route: 'WalletServiceGuardianTransfer' })(
            id,
            label,
            s,
            'transfer',
        ),
    )
const transferReview = (id: string, label: string, s: FaScript) =>
    transferOn(
        on({
            route: 'WalletServiceGuardianTransfer',
            params: { seatIndex: TRANSFER_SEAT_INDEX },
        })(id, label, s, 'transfer'),
    )
const transferDashboard = (id: string, label: string, s: FaScript) =>
    transferOn(
        on({ route: 'WalletServiceDashboard' })(id, label, s, 'transfer'),
    )
const withTransferOff = (screen: FaScreen): FaScreen => ({
    ...screen,
    features: { wallet_service_guardian_transfer: null },
})

export const FA_SCREEN_GROUPS: FaScreenGroup[] = [
    {
        title: 'Setup',
        screens: [
            create(
                'setup.create',
                'Create: choose a size',
                setupHappyPath,
                'create',
            ),
            create(
                'setup.notEnoughGuardians',
                'Create: not enough guardians',
                setupNotEnoughGuardians,
                'create',
            ),
            confirm(
                'setup.confirm',
                'Confirm: quote ready',
                setupHappyPath,
                'confirm',
            ),
            confirm(
                'setup.slowNetwork',
                'Confirm: slow quote and join lookup',
                setupSlowNetwork,
                'confirm',
            ),
            confirm(
                'setup.payerLookupFails',
                'Confirm: payer lookup fails',
                setupPayerLookupFails,
                'confirm',
            ),
            confirm(
                'setup.insufficientBalance',
                'Confirm: not enough balance, top up',
                setupInsufficientBalance,
                'confirm',
            ),
            confirm(
                'setup.noJoinableServices',
                'Confirm: join sheet empty',
                setupNoJoinableServices,
                'confirm',
            ),
            confirm(
                'setup.joinLookupFails',
                'Confirm: join sheet fails',
                setupJoinLookupFails,
                'confirm',
            ),
            confirm(
                'setup.slowJoinLookup',
                'Confirm: join sheet loading',
                setupSlowJoinLookup,
                'confirm',
            ),
            confirm(
                'setup.selectionExpiresFast',
                'Confirm: quote expires in 5s',
                setupSelectionExpiresFast,
                'confirm',
            ),
            confirm(
                'setup.reauthorizationRequired',
                'Confirm: pay needs reauthorization',
                setupReauthorizationRequired,
                'confirm',
            ),
            confirm(
                'setup.quoteRefreshLosesGuardians',
                'Confirm: refresh loses guardians',
                setupQuoteRefreshLosesGuardians,
                'confirm',
            ),
        ],
    },
    {
        title: 'Formation',
        screens: [
            progress(
                'formation.preparing',
                'Progress: preparing',
                formationHappyPath,
                'preparing',
            ),
            progress(
                'formation.acquiringSeats',
                'Progress: acquiring seats',
                formationHappyPath,
                'acquiringSeats',
            ),
            progress(
                'formation.authorize',
                'Progress: authorize extra payment',
                formationAuthorizePayments,
                'authorize',
            ),
            progress(
                'formation.authorizeShort',
                'Progress: authorize, wallet short',
                formationAuthorizePaymentsShort,
                'authorize',
            ),
            progress(
                'formation.preparingDkg',
                'Progress: preparing DKG',
                formationHappyPath,
                'preparingDkg',
            ),
            progress(
                'formation.dkgUnderway',
                'Progress: DKG underway',
                formationHappyPath,
                'dkgUnderway',
            ),
            progress(
                'formation.dkgStuck',
                'Progress: DKG stuck',
                formationDkgStuck,
                'dkgStuck',
            ),
            replaceReview(
                'formation.replaceGuardian',
                'Replace review: guardian dropped out',
                formationGuardianDroppedOut,
                'replaceGuardians',
            ),
            replaceReview(
                'formation.replaceGuardianNoCandidates',
                'Replace review: no candidates',
                formationGuardianDroppedOutNoCandidates,
                'replaceGuardians',
            ),
            progress(
                'formation.dkgComplete',
                'Progress: DKG complete',
                formationHappyPath,
                'dkgComplete',
            ),
            progress(
                'formation.publishingSeatBindings',
                'Progress: publishing seat bindings',
                formationHappyPath,
                'publishingSeatBindings',
            ),
            progress(
                'formation.formedJoining',
                'Progress: formed, joining',
                formationHappyPath,
                'formedJoining',
            ),
            progress(
                'formation.retrying',
                'Progress: retrying after a guardian error',
                formationFails,
                'retrying',
            ),
            progress(
                'formation.failedTerminally',
                'Progress: terminal failure',
                formationFailsTerminally,
                'failedTerminally',
            ),
            dashboard(
                'formation.reconnecting',
                'Dashboard: reconnecting',
                formationReconnecting,
                'reconnecting',
            ),
            progress(
                'formation.joinFailed',
                'Progress: wallet join failed',
                formationCreatedJoinFails,
                'joinFailed',
            ),
            dashboard(
                'formation.formed',
                'Dashboard: formed and joined',
                formationAlreadyFormed,
                'formed',
            ),
        ],
    },
    {
        title: 'Recovery',
        screens: [
            progress(
                'recovery.verifying',
                'Progress: verifying the backup',
                recoveryHappyPath,
                'verifying',
            ),
            progress(
                'recovery.rejoining',
                'Progress: rejoining',
                recoveryHappyPath,
                'rejoining',
            ),
            progress(
                'recovery.restoringBalance',
                'Progress: restoring balance',
                recoveryHappyPath,
                'restoringBalance',
            ),
            dashboard(
                'recovery.ready',
                'Dashboard: restored and ready',
                recoveryHappyPath,
                'ready',
            ),
            dashboard(
                'recovery.stillJoining',
                'Dashboard: still joining after a minute',
                recoverySlowJoin,
                'stillJoining',
            ),
            progress(
                'recovery.joinFailed',
                'Progress: rejoin failed',
                recoveryJoinFails,
                'joinFailed',
            ),
        ],
    },
    {
        title: 'Lightning',
        screens: [
            providerScreen(
                'lightning.attaches',
                'Provider: attaches',
                lightningAttaches,
            ),
            providerScreen(
                'lightning.failsRetryable',
                'Provider: fails, can retry',
                lightningFailsRetryable,
            ),
            providerScreen(
                'lightning.failsTerminally',
                'Provider: fails, skip only',
                lightningFailsTerminally,
            ),
            providerScreen(
                'lightning.noProvider',
                'Provider: none admitted',
                lightningNoProvider,
            ),
            providerScreen(
                'lightning.wrongNetwork',
                'Provider: on another network',
                lightningWrongNetwork,
            ),
            providerScreen(
                'lightning.rejected',
                'Provider: request refused',
                lightningRejected,
            ),
            providerScreen(
                'lightning.neverVerifies',
                'Provider: still setting up',
                lightningNeverVerifies,
            ),
            settings(
                'lightning.alreadyAttaching',
                'Settings: attaching',
                lightningAlreadyAttaching,
                'settings',
            ),
            settings(
                'lightning.alreadyAttached',
                'Settings: attached and verified',
                lightningAlreadyAttached,
                'settings',
            ),
        ],
    },
    {
        title: 'Settings',
        screens: [
            autojoin(
                'settings.autojoinUnsupported',
                'Settings: auto join guardians not updated',
                settingsAutojoinUnsupported,
                'autojoin',
            ),
        ],
    },
    {
        title: 'Guardian replacement',
        screens: [
            transferSettings(
                'transfer.settingsEntry',
                'Entry: Settings row',
                transferSettingsEntry,
            ),
            transferDashboard(
                'transfer.dashboardFlagged',
                'Entry: dashboard banner, 1 flagged',
                transferDashboardFlagged,
            ),
            transferDashboard(
                'transfer.dashboardFlaggedMany',
                'Entry: dashboard banner, 2 flagged',
                transferDashboardFlaggedMany,
            ),
            transferSheet(
                'transfer.sheetEntry',
                'Entry: Guardians sheet',
                transferSheetEntry,
            ),
            transferSheet(
                'transfer.sheetOfflineNotFlagged',
                'Sheet: offline, not flagged',
                transferSheetOfflineNotFlagged,
            ),
            transferList(
                'transfer.pick',
                'Entry: pick a guardian',
                transferPick,
            ),
            transferList(
                'transfer.noneFlagged',
                'Pick: none flagged',
                transferNoneFlagged,
            ),
            transferList(
                'transfer.notChecked',
                'Pick: not checked yet',
                transferNotChecked,
            ),
            transferReview(
                'transfer.searching',
                'Review: searching',
                transferSearching,
            ),
            transferReview(
                'transfer.reviewPriced',
                'Review: paid',
                transferReviewPriced,
            ),
            transferReview(
                'transfer.reviewFree',
                'Review: free',
                transferReviewFree,
            ),
            transferReview(
                'transfer.quoteExpiring',
                'Review: quote refresh',
                transferQuoteExpiring,
            ),
            transferReview(
                'transfer.notEnoughFunds',
                'Error: no funds',
                transferNotEnoughFunds,
            ),
            transferReview(
                'transfer.hostChanged',
                'Error: host changed',
                transferHostChanged,
            ),
            transferReview(
                'transfer.noFreeHost',
                'Error: no free host',
                transferNoFreeHost,
            ),
            transferReview(
                'transfer.startBusy',
                'Error: busy on pay',
                transferStartBusy,
            ),
            transferReview(
                'transfer.paymentFails',
                'Error: payment fails',
                transferPaymentFails,
            ),
            transferReview(
                'transfer.unavailable',
                'Error: replacement not available',
                transferUnavailable,
            ),
            transferReview(
                'transfer.notEligible',
                'Error: guardian recovered',
                transferNotEligible,
            ),
            transferList(
                'transfer.buyingSeat',
                'Step 1: paying',
                transferBuyingSeat,
            ),
            transferList(
                'transfer.awaitingSource',
                'Step 2: waiting',
                transferAwaitingSource,
            ),
            transferList(
                'transfer.publishingBinding',
                'Step 3: approving',
                transferPublishingBinding,
            ),
            transferList(
                'transfer.removingSource',
                'Step 4: releasing',
                transferRemovingSource,
            ),
            transferDashboard(
                'transfer.dashboardWaiting',
                'Dashboard: waiting for old guardian',
                transferDashboardWaiting,
            ),
            transferList(
                'transfer.runToDone',
                'Done: full run',
                transferRunToDone,
            ),
            withTransferOff(
                transferSettings(
                    'transfer.flagOffSettings',
                    'Flag off: Settings',
                    transferFlagOffSettings,
                ),
            ),
            withTransferOff(
                transferSheet(
                    'transfer.flagOffSheet',
                    'Flag off: Guardians sheet',
                    transferFlagOffSheet,
                ),
            ),
        ],
    },
]

export function findFaScreen(id: string): FaScreen | undefined {
    for (const group of FA_SCREEN_GROUPS) {
        const screen = group.screens.find(s => s.id === id)
        if (screen) return screen
    }
    return undefined
}
