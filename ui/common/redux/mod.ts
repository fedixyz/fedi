import { PayloadAction, createSelector, createSlice } from '@reduxjs/toolkit'
import omit from 'lodash/omit'

import { CommonState, selectGlobalCommunityMeta } from '.'
import { FediMod } from '../types'
import { getFederationFediMods } from '../utils/FederationUtils'
import { loadFromStorage } from './storage'

// using an interface here to explicitly define "visibility" instead of an ambigious bool
export interface ModVisibility {
    isHidden: boolean
}

const initialState = {
    customGlobalMods: {} as Record<FediMod['id'], FediMod>,
    customGlobalModVisibility: {} as Record<FediMod['id'], ModVisibility>,
    suggestedGlobalModVisibility: {} as Record<FediMod['id'], ModVisibility>,
}

export type ModState = typeof initialState

export const modSlice = createSlice({
    name: 'mod',
    initialState,
    reducers: {
        addCustomGlobalMod(
            state,
            action: PayloadAction<{
                fediMod: FediMod
            }>,
        ) {
            const { fediMod } = action.payload

            state.customGlobalMods[fediMod.id] = fediMod
        },
        removeCustomGlobalMod(
            state,
            action: PayloadAction<{ modId: FediMod['id'] }>,
        ) {
            const { modId } = action.payload

            // Clean up mod
            if (state.customGlobalMods[modId]) {
                state.customGlobalMods = omit(state.customGlobalMods, modId)
            }
        },
        setCustomGlobalModVisibility(
            state,
            action: PayloadAction<{
                modId: FediMod['id']
                isHidden: boolean
            }>,
        ) {
            const { modId, isHidden } = action.payload

            state.customGlobalModVisibility[modId] = { isHidden }
        },
        setSuggestedGlobalModVisibility(
            state,
            action: PayloadAction<{
                modId: FediMod['id']
                isHidden: boolean
            }>,
        ) {
            const { modId, isHidden } = action.payload

            state.suggestedGlobalModVisibility[modId] = { isHidden }
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return

            state.customGlobalMods = action.payload.customGlobalMods || {}
            state.customGlobalModVisibility =
                action.payload.customGlobalModVisibility || {}
            state.suggestedGlobalModVisibility =
                action.payload.suggestedGlobalModVisibility || {}
        })
    },
})

export const {
    addCustomGlobalMod,
    removeCustomGlobalMod,
    setCustomGlobalModVisibility,
    setSuggestedGlobalModVisibility,
} = modSlice.actions

export const selectGlobalCustomMods = (s: CommonState) =>
    Object.values(s.mod.customGlobalMods)

export const selectGlobalSuggestedMods = createSelector(
    (s: CommonState) => selectGlobalCommunityMeta(s),
    globalCommunityMeta => {
        if (!globalCommunityMeta) return []

        return getFederationFediMods(globalCommunityMeta)
    },
)

export const selectVisibleSuggestedMods = createSelector(
    (s: CommonState) => s.mod.suggestedGlobalModVisibility,
    selectGlobalSuggestedMods,
    (suggestedGlobalModVisibility, mods) =>
        mods.filter(mod => {
            const visibility = suggestedGlobalModVisibility[mod.id]
            if (!visibility) {
                return true
            }

            return !visibility.isHidden
        }),
)

export const selectVisibleCustomMods = createSelector(
    (s: CommonState) => s.mod.customGlobalModVisibility,
    selectGlobalCustomMods,
    (customGlobalModVisibility, mods) =>
        mods.filter(mod => {
            const visibility = customGlobalModVisibility[mod.id]
            if (!visibility) {
                return true
            }

            return !visibility.isHidden
        }),
)

export const selectAllVisibleMods = createSelector(
    selectVisibleSuggestedMods,
    selectVisibleCustomMods,
    (suggested, custom) => [...suggested, ...custom],
)
