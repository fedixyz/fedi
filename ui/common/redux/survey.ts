import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit'

import { CommonState, selectLanguage } from '.'
import { API_ORIGIN } from '../constants/api'
import { makeLog } from '../utils/log'
import { ActiveSurvey, activeSurveySchema } from '../utils/survey'
import { loadFromStorage } from './storage'

const log = makeLog('common/redux/survey')

/*** Initial State ***/

const initialState = {
    surveyCompletions: {} as Record<
        ActiveSurvey['id'],
        | {
              timesDismissed: number
              isCompleted: boolean
          }
        | undefined
    >,
    lastShownSurveyTimestamp: -1,
    activeSurvey: null as ActiveSurvey | null,
}

export type SupportState = typeof initialState

/*** Slice definition ***/

export const surveySlice = createSlice({
    name: 'survey',
    initialState,
    reducers: {
        setActiveSurvey(state, action: PayloadAction<ActiveSurvey>) {
            state.activeSurvey = action.payload
        },
        setSurveyTimestamp(state, action: PayloadAction<number>) {
            state.lastShownSurveyTimestamp = action.payload
        },
        dismissActiveSurvey(state) {
            const activeSurveyId = state.activeSurvey?.id

            if (!activeSurveyId) return

            if (!state.surveyCompletions[activeSurveyId]) {
                state.surveyCompletions[activeSurveyId] = {
                    isCompleted: false,
                    timesDismissed: 1,
                }
            } else {
                state.surveyCompletions[activeSurveyId].timesDismissed += 1
            }
        },
        acceptActiveSurvey(state) {
            const activeSurveyId = state.activeSurvey?.id

            if (!activeSurveyId) return

            if (!state.surveyCompletions[activeSurveyId]) {
                state.surveyCompletions[activeSurveyId] = {
                    timesDismissed: 0,
                    isCompleted: true,
                }
            } else {
                state.surveyCompletions[activeSurveyId].isCompleted = true
            }
        },
        // Only for use in dev settings
        resetSurveyCompletions(state) {
            state.surveyCompletions = {}
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return

            state.lastShownSurveyTimestamp =
                action.payload.lastShownSurveyTimestamp
            state.surveyCompletions = action.payload.surveyCompletions
        })
    },
})

/*** Basic actions ***/

export const {
    setActiveSurvey,
    setSurveyTimestamp,
    dismissActiveSurvey,
    acceptActiveSurvey,
    resetSurveyCompletions,
} = surveySlice.actions

/*** Asynchronous thonkers ***/

export const checkSurveyCondition = createAsyncThunk<
    void,
    undefined,
    { state: CommonState }
>('support/checkSurveyCondition', async (_, { getState, dispatch }) => {
    log.info('-- Checking survey condition --')

    if (!getState().environment.onboardingCompleted) {
        log.info('Onboarding not completed, aborting')
        return
    }

    const lastShownTimestamp = getState().survey.lastShownSurveyTimestamp
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000
    const hasBeenSevenDays =
        lastShownTimestamp && Date.now() - lastShownTimestamp >= oneWeekMs

    if (!hasBeenSevenDays) {
        log.info(
            'User has been surveyed within the past seven days, Aborting',
            lastShownTimestamp,
        )
        return
    }

    const language = selectLanguage(getState())
    let activeSurvey: ActiveSurvey

    log.info('Fetching Active Survey...')

    try {
        const url = new URL(`${API_ORIGIN}/api/survey`)
        url.searchParams.set('lang', language)
        const surveyResponse = await fetch(url.toString()).then(res =>
            res.json(),
        )

        activeSurvey = activeSurveySchema.parse(surveyResponse)

        log.info('Successfully fetched active survey', activeSurvey)
    } catch (e) {
        log.error('Failed to fetch survey condition, Aborting', e)

        return
    }

    if (!activeSurvey.enabled) {
        log.info(`Survey with ID "${activeSurvey.id}" is not enabled, Aborting`)
        return
    }

    const surveyCompletion =
        getState().survey.surveyCompletions[activeSurvey.id]
    const hasBeenSurveyed = surveyCompletion?.isCompleted

    if (hasBeenSurveyed) {
        log.info(
            `Survey with ID "${activeSurvey.id}" has already been accepted, Aborting`,
        )
        return
    }

    const hasDismissedTwice = (surveyCompletion?.timesDismissed ?? 0) >= 2

    if (hasDismissedTwice) {
        log.info(
            `Survey with ID "${activeSurvey.id}" has been dismissed twice already, Aborting`,
        )
        return
    }

    log.info(`Set active survey with ID "${activeSurvey.id}"`)
    dispatch(setActiveSurvey(activeSurvey))
})

/*** Selectors ***/

export const selectActiveSurvey = (s: CommonState) => s.survey.activeSurvey
