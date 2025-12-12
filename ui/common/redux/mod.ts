import { PayloadAction, createSelector, createSlice } from '@reduxjs/toolkit'
import omit from 'lodash/omit'
import without from 'lodash/without'

import { CommonState, federationSlice, selectGlobalCommunityMetadata } from '.'
import {
    FediMod,
    FIRST_PARTY_PERMISSIONS,
    MiniAppPermissionsById,
    MiniAppPermissionType,
} from '../types'
import { getCommunityFediMods } from '../utils/FederationUtils'
import { deduplicate, isModNew } from '../utils/fedimods'
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
    miniAppPermissions: {
        ...FIRST_PARTY_PERMISSIONS,
    } as MiniAppPermissionsById,
    newMods: [] as FediMod['id'][],
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

            state.customGlobalMods[fediMod.id] = {
                ...fediMod,
                dateAdded: Date.now(),
            }

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
            state.newMods = [...state.newMods, fediMod.id]
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

            if (state.newMods.includes(modId)) {
                state.newMods = [...without(state.newMods, modId)]
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
        updateLastSeenModDate(
            state,
            action: PayloadAction<{
                modId: FediMod['id']
            }>,
        ) {
            const { modId } = action.payload
            state.newMods = [...without(state.newMods, modId)]
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
            state.newMods = action.payload.newMods || []
        })
        builder.addCase(
            // When a federation's mods are updated, we need to
            // set the visibility the mods
            federationSlice.actions.setCommunityCustomFediMods,
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

export const {
    addCustomMod,
    removeCustomMod,
    setModVisibility,
    updateLastSeenModDate,
} = modSlice.actions

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
    (s: CommonState) => selectGlobalCommunityMetadata(s),
    globalCommunityMeta => {
        if (!globalCommunityMeta) return []
        return getCommunityFediMods(globalCommunityMeta)
    },
)

// This is used to select lngpt (AI assistant), catalog and swap mods
// to show on new wallet (home) page/screen when user hasn't yet
// joined a federation
export const selectCoreMods = createSelector(
    (s: CommonState) => selectGlobalCommunityMetadata(s),
    globalCommunityMeta => {
        if (!globalCommunityMeta) return []
        const mods = getCommunityFediMods(globalCommunityMeta)
        const coreMods = ['lngpt', 'catalog', 'swap']
        return mods.filter(mod => coreMods.includes(mod.id))
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
    (s: CommonState) => s.federation.lastSelectedCommunityId, // Get active community ID
    (s: CommonState) => s.federation.customFediMods, // Get all community mods
    (s: CommonState) => s.mod.modVisibility, // Get mod visibility data
    (lastSelectedCommunityId, customFediMods, modVisibility) => {
        if (!lastSelectedCommunityId) return [] // If no selected community, return empty array

        // Get the mods for the active federation
        const selectedCommunityMods =
            customFediMods[lastSelectedCommunityId] ?? []

        // Filter mods based on visibility, excluding those hidden for the current federation
        return selectedCommunityMods.filter(mod => {
            const visibility = modVisibility[mod.id]

            // If no visibility entry, mod is visible by default
            if (!visibility) {
                return true
            }

            // Hide only if isHiddenCommunity is true AND federationId matches the active federation
            if (
                visibility.isHiddenCommunity &&
                visibility.federationId === lastSelectedCommunityId
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

export const selectMiniAppPermissions = createSelector(
    (s: CommonState) => s.mod.miniAppPermissions,
    (_: CommonState, miniAppUrl: string | undefined) => miniAppUrl,
    (miniAppPermissions, miniAppUrl): MiniAppPermissionType[] => {
        if (!miniAppUrl) return []
        const url = new URL(miniAppUrl)
        return miniAppPermissions[url.origin] ?? []
    },
)

// determine if the user is browsing a mini-app by comparing domains/subdomains
export const selectMiniAppByUrl = createSelector(
    (s: CommonState) => selectConfigurableMods(s),
    (_: CommonState, url: string) => url,
    (allMiniApps, url) => {
        const currentUrl = new URL(url)
        const matchingMiniApp = allMiniApps.find(miniApp => {
            const miniAppUrl = new URL(miniApp.url)
            return miniAppUrl.hostname === currentUrl.hostname
        })

        return matchingMiniApp
    },
)

export const selectNewModIds = createSelector(
    (s: CommonState) => s.mod.newMods,
    selectAllVisibleMods,
    (newModIds, visibleMods) => {
        return visibleMods
            .filter(mod => {
                return newModIds.includes(mod.id) && isModNew(mod)
            })
            .map(mod => mod.id)
    },
)

export const selectIsNewMod = createSelector(
    selectNewModIds,
    (_: CommonState, targetMod: FediMod) => targetMod,
    (newModIds, targetMod) => {
        return newModIds.includes(targetMod.id)
    },
)
