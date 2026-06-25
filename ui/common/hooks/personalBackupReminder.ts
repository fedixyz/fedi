import { useEffect } from 'react'

import { selectOnboardingMethod } from '../redux/environment'
import { selectNuxStep } from '../redux/nux'
import {
    selectPersonalBackupReminderTriggersMet,
    selectShouldShowBackupReminder,
} from '../redux/personal-backup-reminder/personalBackupReminderSelectors'
import {
    dismissForSession,
    reachedThresholds,
    selectBackupReminderCountdownStartedAt,
    selectHasReachedThresholds,
    setCountdownStartedAt,
} from '../redux/personal-backup-reminder/personalBackupReminderSlice'
import { useCommonDispatch, useCommonSelector } from './redux'

export function usePersonalBackupReminder() {
    const dispatch = useCommonDispatch()
    const countdownStartedAt = useCommonSelector(
        selectBackupReminderCountdownStartedAt,
    )
    const hasBackedUp = useCommonSelector(s =>
        selectNuxStep(s, 'hasPerformedPersonalBackup'),
    )
    const hasMetPersonalBackupReminderTriggers = useCommonSelector(
        selectPersonalBackupReminderTriggersMet,
    )
    const triggerAlreadyRecorded = useCommonSelector(selectHasReachedThresholds)
    const onboardingMethod = useCommonSelector(selectOnboardingMethod)
    const shouldShow = useCommonSelector(selectShouldShowBackupReminder)

    useEffect(() => {
        if (hasBackedUp || onboardingMethod !== 'new_seed') return

        if (countdownStartedAt === null)
            dispatch(setCountdownStartedAt(Date.now()))

        if (!triggerAlreadyRecorded && hasMetPersonalBackupReminderTriggers)
            dispatch(reachedThresholds())
    }, [
        dispatch,
        hasBackedUp,
        onboardingMethod,
        countdownStartedAt,
        triggerAlreadyRecorded,
        hasMetPersonalBackupReminderTriggers,
    ])

    return {
        shouldShow,
        dismissForSession: () => dispatch(dismissForSession()),
    }
}
