/**
 * @file
 * Redux state for the personal backup reminder.
 *
 * Persists to localStorage alongside nux (see utils/storage). The cross-slice
 * selectors that read wallet/federation state live in a sibling file
 * (personalBackupReminderSelectors) to avoid the redux import cycle: this file
 * is registered in redux/index, so it may take only a type-only edge to
 * CommonState, never a runtime barrel import.
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import type { CommonState } from '..'
import { loadFromStorage } from '../storage'

/*** Initial State ***/

const initialState = {
    countdownStartedAt: null as number | null,
    dismissedThisSession: false,
    hasReachedThresholds: false,
}

export type PersonalBackupReminderState = typeof initialState

/*** Slice definition ***/

export const personalBackupReminderSlice = createSlice({
    name: 'personalBackupReminder',
    initialState,
    reducers: {
        dismissForSession(state) {
            state.dismissedThisSession = true
        },
        reachedThresholds(state) {
            state.hasReachedThresholds = true
        },
        setCountdownStartedAt(state, action: PayloadAction<number>) {
            state.countdownStartedAt = action.payload
        },
        // Dev-only: force the reminder to a given countdown start, clearing the
        // flags that would otherwise suppress it, so the overlay can be exercised.
        setCountdownForTesting(state, action: PayloadAction<number | null>) {
            state.dismissedThisSession = false
            state.hasReachedThresholds = false
            state.countdownStartedAt = action.payload
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            const persisted = action.payload?.personalBackupReminder
            if (!persisted) return
            state.countdownStartedAt = persisted.countdownStartedAt ?? null
            state.hasReachedThresholds = persisted.hasReachedThresholds ?? false
        })
        // Reset alongside nux steps so the dev-settings reset re-arms the
        // reminder for re-testing. Matched by action type (not the imported
        // creator) to keep this slice free of a runtime barrel/nux import.
        builder.addCase('nux/resetNuxSteps', state => {
            state.countdownStartedAt = initialState.countdownStartedAt
            state.dismissedThisSession = initialState.dismissedThisSession
            state.hasReachedThresholds = initialState.hasReachedThresholds
        })
    },
})

/*** Basic actions ***/

export const {
    setCountdownStartedAt,
    dismissForSession,
    reachedThresholds,
    setCountdownForTesting,
} = personalBackupReminderSlice.actions

/*** Selectors (type-only state access) ***/

export const selectBackupReminderCountdownStartedAt = (s: CommonState) =>
    s.personalBackupReminder.countdownStartedAt

export const selectHasReachedThresholds = (s: CommonState) =>
    s.personalBackupReminder.hasReachedThresholds

export const selectBackupReminderDismissedThisSession = (s: CommonState) =>
    s.personalBackupReminder.dismissedThisSession
