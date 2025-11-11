/**
 * @file
 * Redux state for the (N)ew (U)ser e(X)perience
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { CommonState } from '.'
import { loadFromStorage } from './storage'

/*** Initial State ***/

const initialState = {
    steps: {
        hasViewedMemberQr: false,
        hasOpenedNewChat: false,
        hasPerformedPersonalBackup: false,
        hasSeenMultispendIntro: false,
        displayNameModal: false,
        communityModal: false,
        chatModal: false,
        modsModal: false,
        scanModal: false,
        pwaHasDismissedInstallPrompt: false, // pwa only
    },
}

export type NuxState = typeof initialState

/*** Slice definition ***/

export const nuxSlice = createSlice({
    name: 'nux',
    initialState,
    reducers: {
        completeNuxStep(state, action: PayloadAction<keyof NuxState['steps']>) {
            state.steps = {
                ...state.steps,
                [action.payload]: true,
            }
        },
        resetNuxSteps(state) {
            state.steps = { ...initialState.steps }
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return
            const { nuxSteps } = action.payload
            const steps = {} as NuxState['steps']
            Object.entries(nuxSteps).forEach(([step, value]) => {
                if (step in state.steps && typeof value !== 'undefined') {
                    steps[step as keyof NuxState['steps']] = value
                }
            })
            state.steps = steps
        })
    },
})

/*** Basic actions ***/

export const { completeNuxStep, resetNuxSteps } = nuxSlice.actions

/*** Selectors ***/

export const selectNuxStep = (s: CommonState, step: keyof NuxState['steps']) =>
    s.nux.steps[step]
