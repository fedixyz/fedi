import { PayloadAction, createSelector, createSlice } from '@reduxjs/toolkit'
import omit from 'lodash/omit'

import { CommonState, federationSlice, selectGlobalCommunityMeta } from '.'
import { FediMod } from '../types'
import { getFederationFediMods } from '../utils/FederationUtils'
import { deduplicate } from '../utils/fedimods'
import { upsertRecordEntityId } from '../utils/redux'
import { loadFromStorage } from './storage'

// using an interface here to explicitly define "visibility" instead of an ambigious bool
export interface ModVisibility {
    isHiddenCommunity?: boolean
    isHidden: boolean
    // true if the mod is included in the global mods list
    isGlobal?: boolean
    // true if the mod is included in a community's mods list
    isCommunity?: boolean
    // true if the mod was created by the user
    isCustom?: boolean
    federationId?: string | null
}

const initialState = {
    // User-created mods list
    customGlobalMods: {} as Record<FediMod['id'], FediMod>,
    // Tracks which mods are visible to the user
    modVisibility: {} as Record<FediMod['id'], ModVisibility>,
}

export type ModState = typeof initialState

export const modSlice = createSlice({
    name: 'mod',
    initialState,
    reducers: {
        addCustomMod(
            state,
            action: PayloadAction<{
                fediMod: FediMod
            }>,
        ) {
            const { fediMod } = action.payload

            state.customGlobalMods[fediMod.id] = fediMod
            const visibility: ModVisibility = {
                ...(state.modVisibility[fediMod.id] ?? {}),
                isHidden: false,
                isCustom: true,
            }
            state.modVisibility = upsertRecordEntityId(
                state.modVisibility,
                visibility,
                fediMod.id,
            )
        },
        removeCustomMod(
            state,
            action: PayloadAction<{ modId: FediMod['id'] }>,
        ) {
            const { modId } = action.payload

            // Clean up mod
            if (state.customGlobalMods[modId]) {
                state.customGlobalMods = omit(state.customGlobalMods, modId)
            }
            if (state.modVisibility[modId].isCommunity) {
                state.modVisibility = {
                    // sets isCustom to false on the visibility
                    // object without touching anything else
                    ...omit(state.modVisibility, modId),
                    [modId]: {
                        ...state.modVisibility[modId],
                        isCustom: false,
                    },
                }
            }
        },
        setModVisibility(
            state,
            action: PayloadAction<{
                modId: FediMod['id']
                isHidden?: boolean
                isHiddenCommunity?: boolean
                federationId?: string
            }>,
        ) {
            const { modId, isHidden, isHiddenCommunity, federationId } =
                action.payload
            const currentVisibility = state.modVisibility[modId] ?? {}
            let newVisibility = { ...currentVisibility }

            if (isHiddenCommunity !== undefined) {
                // Community mods: store isHiddenCommunity and federationId
                newVisibility.isHiddenCommunity = isHiddenCommunity
                if (federationId !== undefined) {
                    newVisibility.federationId = federationId
                }
            } else if (isHidden !== undefined) {
                // Global mods: store isHidden and remove federationId and isHiddenCommunity
                const {
                    federationId: _fedId,
                    isHiddenCommunity: _hiddenComm,
                    ...rest
                } = newVisibility
                void _fedId
                void _hiddenComm
                newVisibility = {
                    ...rest,
                    isHidden,
                }
            }

            state.modVisibility[modId] = newVisibility
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return

            state.customGlobalMods = action.payload.customGlobalMods || {}
            state.modVisibility = action.payload.modVisibility || {}
        })
        builder.addCase(
            // When a federation's mods are updated, we need to
            // set the visibility the mods
            federationSlice.actions.setFederationCustomFediMods,
            (state, action) => {
                if (!action.payload?.mods) return
                for (const mod of action.payload.mods) {
                    // If the mod is already tracked as a community mod,
                    // we don't need to do anything
                    if (state.modVisibility[mod.id]?.isCommunity) continue
                    state.modVisibility = upsertRecordEntityId(
                        state.modVisibility,
                        {
                            ...state.modVisibility[mod.id],
                            isHidden: false,
                            isCommunity: true,
                        } as ModVisibility,
                        mod.id,
                    ) as Record<FediMod['id'], ModVisibility>
                }
            },
        )
    },
})

export const { addCustomMod, removeCustomMod, setModVisibility } =
    modSlice.actions

export const selectCustomMods = (s: CommonState) =>
    Object.values(s.mod.customGlobalMods)

// Community-set mods
export const selectCommunityMods = createSelector(
    (s: CommonState) => s.federation.customFediMods,
    communityMods =>
        Object.values(communityMods).flatMap(modList => modList ?? []),
)

// Global mods
export const selectGlobalMods = createSelector(
    (s: CommonState) => selectGlobalCommunityMeta(s),
    globalCommunityMeta => {
        if (!globalCommunityMeta) return []

        return getFederationFediMods(globalCommunityMeta)
    },
)

// Global mods
export const selectVisibleGlobalMods = createSelector(
    (s: CommonState) => s.mod.modVisibility,
    selectGlobalMods,
    (modVisibility, mods) =>
        mods.filter(mod => {
            const visibility = modVisibility[mod.id]
            if (!visibility) {
                return true
            }

            return !visibility.isHidden
        }),
)

// User-created mods
export const selectVisibleCustomMods = createSelector(
    (s: CommonState) => s.mod.modVisibility,
    selectCustomMods,
    (modVisibility, mods) =>
        mods.filter(mod => {
            const visibility = modVisibility[mod.id]
            if (!visibility) {
                return true
            }

            return !visibility.isHidden
        }),
)

export const selectVisibleCommunityMods = createSelector(
    (s: CommonState) => s.federation.activeFederationId, // Get active federation ID
    (s: CommonState) => s.federation.customFediMods, // Get all community mods
    (s: CommonState) => s.mod.modVisibility, // Get mod visibility data
    (activeFederationId, customFediMods, modVisibility) => {
        if (!activeFederationId) return [] // If no active federation, return empty array

        // Get the mods for the active federation
        const activeFederationMods = customFediMods[activeFederationId] ?? []

        // Filter mods based on visibility, excluding those hidden for the current federation
        return activeFederationMods.filter(mod => {
            const visibility = modVisibility[mod.id]

            // If no visibility entry, mod is visible by default
            if (!visibility) {
                return true
            }

            // Hide only if isHiddenCommunity is true AND federationId matches the active federation
            if (
                visibility.isHiddenCommunity &&
                visibility.federationId === activeFederationId
            ) {
                return false
            }

            return true
        })
    },
)

export const selectModsVisibility = (s: CommonState) => s.mod.modVisibility
export const selectModVisibility = (s: CommonState, id: string) =>
    s.mod.modVisibility[id]

export const selectConfigurableMods = createSelector(
    selectGlobalMods,
    selectCustomMods,
    (global, custom) =>
        // Filter out duplicate mods
        deduplicate([...global, ...custom]),
)

export const selectAllVisibleMods = createSelector(
    selectVisibleGlobalMods,
    selectVisibleCustomMods,
    (global, custom) =>
        // Filter out duplicate mods
        deduplicate([...global, ...custom]),
)
