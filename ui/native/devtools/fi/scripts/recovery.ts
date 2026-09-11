import { restoredStatus } from '../status'
import {
    FiScript,
    checkpoint,
    formWalletService,
    script,
    stream,
    wait,
} from '../steps'

const RECONCILE_MS = 6_000
const JOIN_MS = 8_000
const RECOVERY_MS = 4_000
const SLOW_MS = 60_000
const JOIN_FAILS_AFTER_MS = 10_000

// the backup does not carry the name: reconciliation learns it from the
// Fleet Managers, and the invite is only handed to the auto-join once fresh
const unsynced = stream(ctx => restoredStatus(ctx, { freshness: 'unsynced' }))
const reconciled = stream(ctx =>
    restoredStatus(ctx, {
        freshness: 'fresh',
        backupEligible: true,
        federationName: 'My Wallet Service',
    }),
)

export const recoveryHappyPath: FiScript = script('recovery.happyPath', [
    unsynced,
    checkpoint('verifying'),
    wait(RECONCILE_MS),
    reconciled,
    formWalletService('joining'),
    checkpoint('rejoining'),
    wait(JOIN_MS),
    formWalletService('recovering'),
    checkpoint('restoringBalance'),
    wait(RECOVERY_MS),
    formWalletService('ready'),
    checkpoint('ready'),
])

export const recoverySlowJoin: FiScript = script('recovery.slowJoin', [
    unsynced,
    wait(SLOW_MS),
    reconciled,
    formWalletService('joining'),
    checkpoint('stillJoining'),
    wait(SLOW_MS),
    formWalletService('recovering'),
    wait(SLOW_MS),
    formWalletService('ready'),
])

export const recoveryJoinFails: FiScript = script('recovery.joinFails', [
    unsynced,
    wait(RECONCILE_MS),
    reconciled,
    formWalletService('joining'),
    wait(JOIN_FAILS_AFTER_MS),
    formWalletService('failed'),
    checkpoint('joinFailed'),
])

export const RECOVERY_SCRIPTS: FiScript[] = [
    recoveryHappyPath,
    recoverySlowJoin,
    recoveryJoinFails,
]
