/**
 * @file
 * Cross-slice selectors for the personal backup reminder.
 *
 * These live outside the slice file because they read federation and wallet
 * state. The slice file is part of the store's reducer graph (imported by
 * redux/index), so importing the federation/wallet slice modules from it forms
 * an import cycle that leaves slice reducers undefined when a slice module is
 * the entry point. Keeping these selectors here — and importing the
 * federation/wallet selectors via the `..` barrel — forces redux/index to
 * evaluate fully before any selector runs, sidestepping the cycle.
 */
import {
    CommonState,
    selectFeatureFlag,
    selectTotalBalanceMsats,
    selectTotalStableBalanceSats,
} from '..'
import { Sats } from '../../types/units'
import amountUtils from '../../utils/AmountUtils'

/**
 * Minimum aggregate stored value (ecash + stable, across all wallets) that
 * triggers the personal backup reminder. "De minimus" value worth protecting.
 */
export const BACKUP_REMINDER_THRESHOLD_SATS = 210 as Sats

/** Time after the countdown start that triggers the reminder for new users. */
export const BACKUP_REMINDER_ELAPSED_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Whether the user has crossed either trigger: aggregate stored value
 * (ecash + stable) >= the threshold, or the countdown has elapsed.
 */
export const selectPersonalBackupReminderTriggersMet = (
    s: CommonState,
): boolean => {
    const stableSats = selectTotalStableBalanceSats(s)
    const ecashSats = amountUtils.msatToSat(selectTotalBalanceMsats(s))
    if (ecashSats + stableSats >= BACKUP_REMINDER_THRESHOLD_SATS) return true

    const startedAt = s.personalBackupReminder.countdownStartedAt
    return (
        startedAt !== null &&
        Date.now() - startedAt >= BACKUP_REMINDER_ELAPSED_MS
    )
}

export const selectShouldShowBackupReminder = (s: CommonState): boolean => {
    if (!selectFeatureFlag(s, 'personal_backup_reminder')) return false

    // Suppressed once the user backs up or dismisses for the session. Only
    // new-seed accounts are reminded: any other onboarding method (restored, or
    // an unknown/legacy method) already has or assumes an existing backup.
    if (
        s.nux.steps.hasPerformedPersonalBackup ||
        s.environment.onboardingMethod !== 'new_seed' ||
        s.personalBackupReminder.dismissedThisSession
    )
        return false

    return (
        s.personalBackupReminder.hasReachedThresholds ||
        selectPersonalBackupReminderTriggersMet(s)
    )
}
