import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { CommonState } from '.'
import { loadFromStorage } from './storage'

/*** Initial State ***/

const initialState: PinState = {
    protectedFeatures: {
        app: true,
        changePin: true,
        nostrSettings: true,
    },
    unlockedFeatures: {
        app: false,
        changePin: false,
        nostrSettings: false,
    },
    isBackingUpBeforePin: false,
}

export interface ProtectedFeatures {
    app: boolean
    changePin: boolean
    nostrSettings: boolean
}

export type PinState = {
    protectedFeatures: ProtectedFeatures
    unlockedFeatures: ProtectedFeatures
    isBackingUpBeforePin: boolean
}

/*** Slice definition ***/

export const securitySlice = createSlice({
    name: 'security',
    initialState,
    reducers: {
        setFeatureUnlocked(
            state,
            action: PayloadAction<{
                key: keyof ProtectedFeatures
                unlocked: boolean
            }>,
        ) {
            state.unlockedFeatures[action.payload.key] = action.payload.unlocked
        },
        setProtectedFeature(
            state,
            action: PayloadAction<{
                key: keyof ProtectedFeatures
                enabled: boolean
            }>,
        ) {
            state.protectedFeatures[action.payload.key] = action.payload.enabled
        },
        setIsBackingUpBeforePin(state, action: PayloadAction<boolean>) {
            state.isBackingUpBeforePin = action.payload
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return

            if (action.payload.protectedFeatures) {
                const { protectedFeatures } = action.payload
                const actions = {
                    ...state.protectedFeatures,
                }
                Object.entries(protectedFeatures).forEach(([key, value]) => {
                    if (
                        key in state.protectedFeatures &&
                        typeof value !== 'undefined'
                    ) {
                        actions[key as keyof ProtectedFeatures] = value
                    }
                })
                state.protectedFeatures = actions
            }
        })
    },
})

/*** Basic actions ***/

export const {
    setIsBackingUpBeforePin,
    setFeatureUnlocked,
    setProtectedFeature,
} = securitySlice.actions

/*** Selectors ***/

export const selectIsFeatureUnlocked = (
    s: CommonState,
    feature: keyof ProtectedFeatures,
) => s.security.unlockedFeatures[feature]

export const selectUnlockedFeatures = (s: CommonState) =>
    s.security.unlockedFeatures

export const selectProtectedFeatures = (s: CommonState) =>
    s.security.protectedFeatures

export const selectIsRecoveringBeforePin = (s: CommonState) =>
    s.security.isBackingUpBeforePin
