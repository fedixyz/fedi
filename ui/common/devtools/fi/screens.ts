import {
    formationAlreadyFormed,
    formationAuthorizePayments,
    formationAuthorizePaymentsShort,
    formationCreatedJoinFails,
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
import type { FiScript } from './steps'

// string literals rather than a native import: they are checked against
// RootStackParamList where the panel calls navigate()
export type FiScreenRoute =
    | 'CreateWalletService'
    | 'ConfirmWalletService'
    | 'WalletServiceProgress'
    | 'WalletServiceDashboard'
    | 'WalletServiceReplaceReview'
    | 'WalletServiceLightningProvider'
    | 'WalletServiceSettings'

export type FiScreenParams = { openSheet: 'provider' } | undefined

export type FiScreen = {
    id: string
    label: string
    script: FiScript
    checkpoint: string
    route: FiScreenRoute
    params?: FiScreenParams
}

export type FiScreenGroup = { title: string; screens: FiScreen[] }

const on =
    (route: FiScreenRoute, params?: FiScreenParams) =>
    (
        id: string,
        label: string,
        script: FiScript,
        checkpoint: string,
    ): FiScreen => ({
        id,
        label,
        script,
        checkpoint,
        route,
        params,
    })

const create = on('CreateWalletService')
const confirm = on('ConfirmWalletService')
const progress = on('WalletServiceProgress')
const dashboard = on('WalletServiceDashboard')
const replaceReview = on('WalletServiceReplaceReview')
const providerScreen = (id: string, label: string, s: FiScript) =>
    on('WalletServiceLightningProvider')(id, label, s, 'provider')
const settings = on('WalletServiceSettings', { openSheet: 'provider' })

export const FI_SCREEN_GROUPS: FiScreenGroup[] = [
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
]

export function findFiScreen(id: string): FiScreen | undefined {
    for (const group of FI_SCREEN_GROUPS) {
        const screen = group.screens.find(s => s.id === id)
        if (screen) return screen
    }
    return undefined
}
