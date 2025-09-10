import {
    createSlice,
    PayloadAction,
    Dispatch,
    createAsyncThunk,
} from '@reduxjs/toolkit'
import { z } from 'zod'

import { CommonState } from '.'
import { API_ORIGIN } from '../constants/api'
import { makeLog } from '../utils/log'
import { loadFromStorage } from './storage'

const log = makeLog('common/redux/support')

/*** Initial State ***/

const initialState = {
    supportPermissionGranted: false,
    zendeskPushNotificationToken: null as string | null,
    zendeskInitialized: false,
    zendeskUnreadMessageCount: 0,
    lastShownSurveyTimestamp: null as number | null,
    surveyUrl: null as string | null,
    canShowSurvey: false,
}

export type SupportState = typeof initialState

/*** Slice definition ***/

export const supportSlice = createSlice({
    name: 'support',
    initialState,
    reducers: {
        setSupportPermission(state, action: PayloadAction<boolean>) {
            state.supportPermissionGranted = action.payload
        },
        setZendeskPushNotificationToken(state, action: PayloadAction<string>) {
            state.zendeskPushNotificationToken = action.payload
        },
        setZendeskInitialized(state, action: PayloadAction<boolean>) {
            state.zendeskInitialized = action.payload
        },
        setZendeskUnreadMessageCount(state, action: PayloadAction<number>) {
            state.zendeskUnreadMessageCount = action.payload
        },
        resetSurveyTimestamp(state) {
            state.lastShownSurveyTimestamp = Date.now()
        },
        setCanShowSurvey(state, action: PayloadAction<boolean>) {
            state.canShowSurvey = action.payload
        },
        setSurveyUrl(state, action: PayloadAction<string | null>) {
            state.surveyUrl = action.payload
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload?.support) return
            const { supportPermissionGranted, zendeskPushNotificationToken } =
                action.payload.support

            state.supportPermissionGranted =
                supportPermissionGranted ?? state.supportPermissionGranted
            state.zendeskPushNotificationToken =
                zendeskPushNotificationToken ??
                state.zendeskPushNotificationToken
            state.lastShownSurveyTimestamp =
                action.payload.lastShownSurveyTimestamp
        })
    },
})

/*** Basic actions ***/

export const {
    setSupportPermission,
    setZendeskPushNotificationToken,
    setZendeskInitialized,
    setZendeskUnreadMessageCount,
    resetSurveyTimestamp,
    setCanShowSurvey,
    setSurveyUrl,
} = supportSlice.actions

/*** Asynchronous thonkers ***/

export const checkSurveyCondition = createAsyncThunk<
    void,
    undefined,
    { state: CommonState }
>('support/checkSurveyCondition', async (_, { getState, dispatch }) => {
    const state = getState()

    const oneWeekMs = 7 * 24 * 60 * 60 * 1000
    const lastShownTimestamp = state.support.lastShownSurveyTimestamp
    const hasBeenSevenDays =
        lastShownTimestamp && Date.now() - lastShownTimestamp >= oneWeekMs

    log.debug('Checking survey condition', {
        hasBeenSevenDays,
        lastShownTimestamp,
    })

    let enabled = false
    let url: string | null = null

    // If it has been 7 days since the last survey
    // OR if the user has already accepted the survey
    // don't show the survey again
    if (hasBeenSevenDays && !state.nux.steps.hasAcceptedSurvey) {
        try {
            const surveyResponse = await fetch(
                `${API_ORIGIN}/api/active-survey`,
            ).then(res => res.json())

            const surveySchema = z.object({
                enabled: z.boolean(),
                url: z.string(),
            })

            const surveyData = surveySchema.safeParse(surveyResponse)

            if (surveyData.success) {
                url = surveyData.data.url
                enabled = surveyData.data.enabled
            }
        } catch (e) {
            log.error('Failed to fetch survey condition', e)
        }
    }

    const hasBeenSurveyed = state.nux.steps.hasAcceptedSurvey
    const canShowSurvey = enabled && !hasBeenSurveyed && !!url

    log.debug('Finalizing survey condition', {
        url,
        enabled: canShowSurvey,
    })

    dispatch(setSurveyUrl(url))
    if (url) dispatch(setCanShowSurvey(canShowSurvey))
})

/*** Selectors ***/

export const selectSupportPermissionGranted = (s: CommonState) =>
    s.support.supportPermissionGranted

export const selectZendeskPushNotificationToken = (s: CommonState) =>
    s.support.zendeskPushNotificationToken

export const selectZendeskInitialized = (s: CommonState) =>
    s.support.zendeskInitialized

export const selectZendeskUnreadMessageCount = (s: CommonState) =>
    s.support.zendeskUnreadMessageCount

export const selectSurveyUrl = (s: CommonState) => s.support.surveyUrl

export const selectCanShowSurvey = (s: CommonState) => s.support.canShowSurvey

/*** Synchronous wrapper actions ***/

export const grantSupportPermission = () => (dispatch: Dispatch) => {
    dispatch(setSupportPermission(true))
}

export const saveZendeskPushNotificationToken =
    (token: string) => (dispatch: Dispatch) => {
        dispatch(setZendeskPushNotificationToken(token))
    }

export const updateZendeskUnreadMessageCount =
    (count: number) => (dispatch: Dispatch) => {
        dispatch(setZendeskUnreadMessageCount(count))
    }
