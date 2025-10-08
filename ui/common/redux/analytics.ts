import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'

import { CommonState, selectAppFlavor } from '.'
import { AnalyticsConsent } from '../types/analytics'
import { submitAnalyticsConsent as submitAnalyticsConsentApi } from '../utils/analytics'
import { makeLog } from '../utils/log'
import { loadFromStorage } from './storage'

const log = makeLog('common/redux/analytics')

/*** Initial State ***/

const initialState = {
    hasConsentedToAnalytics: null as boolean | null,
    hasSeenAnalyticsConsentModal: false,
    shouldShowAnalyticsConsentModal: false,
    analyticsId: null as string | null,
}

export type AnalyticsState = typeof initialState

/*** Slice definition ***/

export const analyticsSlice = createSlice({
    name: 'analytics',
    initialState,
    reducers: {
        setHasConsentedToAnalytics(state, action: PayloadAction<boolean>) {
            state.hasConsentedToAnalytics = action.payload
        },
        setHasSeenAnalyticsConsentModal(state, action: PayloadAction<boolean>) {
            state.hasSeenAnalyticsConsentModal = action.payload
        },
        setAnalyticsId(state, action: PayloadAction<string>) {
            state.analyticsId = action.payload
        },
        clearAnalyticsState(state) {
            state.analyticsId = null
            state.hasConsentedToAnalytics = null
            state.hasSeenAnalyticsConsentModal = false
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            const storedId = action.payload?.analyticsId
            log.info('loading analytics state', {
                storedId,
                hasConsentedToAnalytics:
                    action.payload?.hasConsentedToAnalytics,
                hasSeenAnalyticsConsentModal:
                    action.payload?.hasSeenAnalyticsConsentModal,
            })
            // If the analytics id is null, generate it here and will now persist to storage
            if (!storedId) {
                state.analyticsId = uuidv4()
            } else {
                state.analyticsId = storedId
            }
            state.hasConsentedToAnalytics =
                action.payload?.hasConsentedToAnalytics ?? null
            state.hasSeenAnalyticsConsentModal =
                action.payload?.hasSeenAnalyticsConsentModal ?? false
        })
    },
})

/*** Basic actions ***/

export const {
    setHasConsentedToAnalytics,
    setHasSeenAnalyticsConsentModal,
    setAnalyticsId,
    clearAnalyticsState,
} = analyticsSlice.actions

/*** Async thunk actions ***/

export const submitAnalyticsConsent = createAsyncThunk<
    void,
    Pick<AnalyticsConsent, 'consent' | 'voteMethod'>,
    { state: CommonState }
>(
    'analytics/submitAnalyticsConsent',
    async (consentData, { dispatch, getState }) => {
        const state = getState()
        const analyticsId = state.analytics.analyticsId
        if (!analyticsId) throw new Error('Analytics ID is not set')

        dispatch(setHasSeenAnalyticsConsentModal(true))

        const appFlavor = selectAppFlavor(state)
        try {
            await submitAnalyticsConsentApi({
                ...consentData,
                analyticsId,
                appFlavor: appFlavor ?? 'bravo',
            })
            // only save the changed consent status if the request was successful
            dispatch(setHasConsentedToAnalytics(consentData.consent))
        } catch (err) {
            // TODO: figure out how to return an AsyncResult without
            // redux yelling about an "unserializable value"
            log.error('Failed to submit analytics consent', err)
            throw err
        }
    },
)

/*** Selectors ***/

// ref: https://www.notion.so/fedi21/Triggering-the-Prompt-After-App-Usage-Milestone-241eb0892aa080dcb3b6cfd053909a2a?source=copy_link
export const shouldShowAnalyticsConsentModal = (s: CommonState) =>
    s.environment.sessionCount > 3 &&
    s.environment.onboardingCompleted &&
    s.analytics.hasSeenAnalyticsConsentModal === false

export const selectAnalyticsConsent = (s: CommonState) =>
    s.analytics.hasConsentedToAnalytics
