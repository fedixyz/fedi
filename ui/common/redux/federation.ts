import {
    createAsyncThunk,
    createSelector,
    createSlice,
    PayloadAction,
} from '@reduxjs/toolkit'
import isEqual from 'lodash/isEqual'
import omit from 'lodash/omit'
import orderBy from 'lodash/orderBy'
import { makeLog } from '../utils/log'

import {
    CommonState,
    previewCommunityDefaultChats,
    previewGlobalDefaultChats,
    selectIsInternetUnreachable,
} from '.'
import { FEDI_GLOBAL_COMMUNITY } from '../constants/community'
import {
    ClientConfigMetadata,
    Federation,
    FederationListItem,
    FediMod,
    Guardian,
    LoadedFederation,
    MatrixRoom,
    MSats,
    PublicFederation,
    Sats,
} from '../types'
import { RpcJsonClientConfig, RpcStabilityPoolConfig } from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    coerceFederationListItem,
    coerceLoadedFederation,
    fetchFederationsExternalMetadata,
    getFederationFediMods,
    getFederationGroupChats,
    getFederationMaxBalanceMsats,
    getFederationMaxInvoiceMsats,
    getFederationMaxStableBalanceMsats,
    getFederationName,
    getFederationPinnedMessage,
    getFederationStatus,
    getFederationWelcomeMessage,
    joinFromInvite,
} from '../utils/FederationUtils'
import type { FedimintBridge } from '../utils/fedimint'
import { makeChatFromPreview } from '../utils/matrix'
import { upsertListItem, upsertRecordEntityId } from '../utils/redux'
import { loadFromStorage } from './storage'

const log = makeLog('common/redux/federation')

/*** Initial State ***/

const initialState = {
    federations: [] as FederationListItem[],
    publicFederations: [] as PublicFederation[],
    activeFederationId: null as string | null,
    payFromFederationId: null as string | null,
    authenticatedGuardian: null as Guardian | null,
    externalMeta: {} as Record<
        Federation['id'],
        ClientConfigMetadata | undefined
    >,
    customFediMods: {} as Record<Federation['id'], FediMod[] | undefined>,
    defaultCommunityChats: {} as Record<Federation['id'], MatrixRoom[]>,
}

export type FederationState = typeof initialState

/*** Slice definition ***/

export const federationSlice = createSlice({
    name: 'federation',
    initialState,
    reducers: {
        setFederations(state, action: PayloadAction<FederationListItem[]>) {
            let hasAnyUpdates = false

            const updatedFederations = state.federations.map(
                existingFederation => {
                    const federationToUpsert = action.payload.find(
                        f => f.id === existingFederation.id,
                    )
                    if (!federationToUpsert) return existingFederation
                    let updatedFederation: FederationListItem

                    switch (federationToUpsert.init_state) {
                        case 'loading':
                        case 'failed':
                            updatedFederation = federationToUpsert
                            break
                        case 'ready':
                        default:
                            updatedFederation = {
                                ...existingFederation,
                                ...federationToUpsert,
                            }
                            if ('meta' in federationToUpsert) {
                                // Merge meta objects, preserving existing fields
                                const mergedMeta = {
                                    ...('meta' in existingFederation
                                        ? existingFederation.meta
                                        : {}),
                                    ...federationToUpsert.meta,
                                }
                                updatedFederation.meta = mergedMeta
                            }
                            break
                    }

                    const hasUpdates = !isEqual(
                        existingFederation,
                        updatedFederation,
                    )
                    if (hasUpdates) hasAnyUpdates = true

                    return hasUpdates ? updatedFederation : existingFederation
                },
            )

            // Add new federations that don't exist in the current state
            const newFederations = action.payload.filter(
                newFed =>
                    !state.federations.some(
                        existingFed => existingFed.id === newFed.id,
                    ),
            )

            if (newFederations.length > 0) {
                hasAnyUpdates = true
            }

            // Only update state if there were changes
            if (hasAnyUpdates) {
                state.federations = [...updatedFederations, ...newFederations]
            }
        },
        setPublicFederations(state, action: PayloadAction<PublicFederation[]>) {
            state.publicFederations = action.payload
        },
        upsertFederation(state, action: PayloadAction<FederationListItem>) {
            if (!action.payload.id) return
            state.federations = upsertListItem<FederationListItem>(
                state.federations,
                action.payload,
                ['meta'],
            )
        },
        updateFederationBalance(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                balance: LoadedFederation['balance']
            }>,
        ) {
            const { federationId, balance } = action.payload
            const federation = state.federations.find(
                f => f.id === federationId,
            )
            // No-op if we don't have that federation ready, it's a
            // no-wallet community or balance has not changed
            if (
                !federation ||
                federation.init_state !== 'ready' ||
                !federation.hasWallet ||
                federation.balance === balance
            )
                return
            state.federations = state.federations.map(f => {
                if (f.id !== federationId) return f
                return { ...f, balance }
            })
        },
        setActiveFederationId(state, action: PayloadAction<string | null>) {
            state.activeFederationId = action.payload
        },
        setPayFromFederationId(state, action: PayloadAction<string | null>) {
            state.payFromFederationId = action.payload
        },
        setFederationCustomFediMods(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                mods: FediMod[] | undefined
            }>,
        ) {
            const { federationId, mods } = action.payload
            if (isEqual(mods, state.customFediMods[federationId] || [])) return

            state.customFediMods = {
                ...state.customFediMods,
                [federationId]: mods,
            }
        },
        setFederationExternalMeta(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                meta: ClientConfigMetadata | undefined
            }>,
        ) {
            state.externalMeta = upsertRecordEntityId(
                state.externalMeta,
                action.payload.meta,
                action.payload.federationId,
            )
        },
        changeAuthenticatedGuardian(
            state,
            action: PayloadAction<Guardian | null>,
        ) {
            state.authenticatedGuardian = action.payload
        },
        removeCustomFediMod(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                fediModId: FediMod['id']
            }>,
        ) {
            const { federationId, fediModId } = action.payload
            const fediMods = state.customFediMods[federationId] || []
            state.customFediMods[federationId] = fediMods.filter(
                f => f.id !== fediModId,
            )
        },
    },
    extraReducers: builder => {
        builder.addCase(leaveFederation.fulfilled, (state, action) => {
            const { federationId } = action.meta.arg
            // Remove from federations
            state.federations = state.federations.filter(
                fed => fed.id !== federationId,
            )
            if (state.federations.length === 0) {
                state.activeFederationId = null
            } else if (state.activeFederationId === federationId) {
                state.activeFederationId = state.federations[0]?.id
            }
            // Clean up external meta entry
            if (state.externalMeta[federationId]) {
                state.externalMeta = omit(state.externalMeta, federationId)
            }
            if (state.customFediMods[federationId]) {
                state.customFediMods = omit(state.customFediMods, federationId)
            }
        })

        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return
            state.activeFederationId = action.payload.activeFederationId
            state.authenticatedGuardian = action.payload.authenticatedGuardian
            state.externalMeta = action.payload.externalMeta
            state.customFediMods = action.payload.customFediMods || {}
        })

        builder.addCase(
            previewCommunityDefaultChats.fulfilled,
            (state, action) => {
                const chatPreviews = action.payload.map(makeChatFromPreview)
                const federationId = action.meta.arg
                state.defaultCommunityChats = isEqual(
                    chatPreviews,
                    state.defaultCommunityChats[federationId],
                )
                    ? state.defaultCommunityChats
                    : {
                          ...state.defaultCommunityChats,
                          [federationId]: chatPreviews,
                      }
            },
        )
    },
})

/*** Basic actions ***/

export const {
    setFederations,
    setPublicFederations,
    upsertFederation,
    updateFederationBalance,
    setActiveFederationId,
    setPayFromFederationId,
    setFederationCustomFediMods,
    setFederationExternalMeta,
    changeAuthenticatedGuardian,
    removeCustomFediMod,
} = federationSlice.actions

/*** Async thunk actions */

export const refreshFederations = createAsyncThunk<
    FederationListItem[],
    FedimintBridge,
    { state: CommonState }
>('federation/refreshFederations', async (fedimint, { dispatch, getState }) => {
    const federationsList = await fedimint.listFederations()

    log.info(`refreshing ${federationsList.length} federations`)

    const federations: FederationListItem[] = federationsList.map(f => {
        let federation: FederationListItem
        switch (f.init_state) {
            case 'loading':
            case 'failed':
                federation = {
                    ...f,
                    hasWallet: true,
                }
                return federation
            case 'ready': {
                const loadedFederation = coerceLoadedFederation(f)

                dispatch(
                    refreshGuardianStatuses({
                        fedimint,
                        federation: loadedFederation,
                    }),
                )
                return loadedFederation
            }
        }
    })

    const communities = await fedimint.listCommunities({})
    const communitiesAsFederations = communities.map(coerceFederationListItem)

    const allFederations = [...federations, ...communitiesAsFederations]
    dispatch(setFederations(allFederations))

    // Create externalMeta object directly from federation data since
    // bridge does the external meta URL fetching now
    // TODO: Remove this along with the refactor to use federation.federations
    // as the source of truth for all metadata and can remove the need to maintain
    // and update this externalMeta slice in redux
    allFederations.map(federation => {
        if (
            'meta' in federation &&
            federation.meta &&
            Object.keys(federation.meta).length > 0
        ) {
            dispatch(
                processFederationMeta({
                    federation,
                }),
            )
        }
    })
    // note: this await should only block for 2 seconds maximum. if internet is slow
    // it will abort and retry in the background
    // TODO: Move the global community meta fetch to the bridge
    await fetchFederationsExternalMetadata(
        // For the purposes of gathering metadata, we need to
        // treat the global community as a "wallet" federation.
        // The means we'll fetch the external metadata for it.
        [FEDI_GLOBAL_COMMUNITY],
        (federationId, meta) => {
            dispatch(
                processFederationMeta({
                    federation: { id: federationId, meta },
                }),
            )
        },
    )
    return selectFederations(getState())
})

export const refreshGuardianStatuses = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; federation: LoadedFederation },
    { state: CommonState }
>(
    'federation/refreshGuardianStatuses',
    async ({ fedimint, federation }, { dispatch, getState }) => {
        // Don't bother refreshing if we know internet is unreachable
        const isInternetUnreachable = selectIsInternetUnreachable(getState())
        log.info(
            `refreshing guardian statuses for federation ${getFederationName(
                federation,
            )}: internet unreachable: ${isInternetUnreachable}`,
        )
        if (isInternetUnreachable) return

        // TODO: move this logic to the bridge?
        try {
            const updatedStatus = await getFederationStatus(
                fedimint,
                federation.id,
            )
            dispatch(
                upsertFederation({
                    ...federation,
                    status: updatedStatus,
                }),
            )
        } catch (error) {
            log.error(
                `Error in guardian status fetch for federation ${federation.id}:`,
                error,
            )
        }
    },
)

export const processFederationMeta = createAsyncThunk<
    void,
    { federation: Pick<FederationListItem, 'id' | 'meta'> },
    { state: CommonState }
>('federation/processFederationMeta', async ({ federation }, { dispatch }) => {
    if (!federation.meta) return

    // TODO: Remove this along with the refactor to use federation.federations
    // as the source of truth for all metadata and can remove the need to maintain
    // and update this externalMeta slice in redux for federation meta
    dispatch(
        setFederationExternalMeta({
            federationId: federation.id,
            meta: federation.meta,
        }),
    )

    // fedimods & default chats are derived from the federation meta
    dispatch(
        setFederationCustomFediMods({
            federationId: federation.id,
            mods: getFederationFediMods(federation.meta),
        }),
    )
    // use a special preview action for the global community since it is
    // not stored in redux
    if (federation.id === FEDI_GLOBAL_COMMUNITY.id) {
        dispatch(previewGlobalDefaultChats())
    } else {
        dispatch(previewCommunityDefaultChats(federation.id))
    }
})

export const joinFederation = createAsyncThunk<
    FederationListItem,
    { fedimint: FedimintBridge; code: string; recoverFromScratch?: boolean },
    { state: CommonState }
>(
    'federation/joinFederation',
    async (
        { fedimint, code, recoverFromScratch = false },
        { dispatch, getState },
    ) => {
        const federation = await joinFromInvite(
            fedimint,
            code,
            recoverFromScratch,
        )

        await dispatch(refreshFederations(fedimint))
        dispatch(setActiveFederationId(federation.id))
        // matrix client should be initialized by now
        // so we can join default groups
        dispatch(previewCommunityDefaultChats(federation.id))

        const activeFederation = selectActiveFederation(getState())
        if (!activeFederation) throw new Error('errors.unknown-error')
        return activeFederation
    },
)

export const leaveFederation = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; federationId: string },
    { state: CommonState }
>(
    'federation/leaveFederation',
    async ({ fedimint, federationId }, { getState }) => {
        const federation = selectFederation(getState(), federationId)
        if (!federation) throw new Error('failed-to-leave-federation')

        // Fixes https://github.com/fedibtc/fedi/issues/3754
        const isRecovering = selectIsAnyFederationRecovering(getState())
        if (isRecovering || !federation)
            throw new Error('failed-to-leave-federation')

        if (federation.init_state !== 'ready') {
            // this handles leaving a federation that has failed to load or is in the process of loading
            await fedimint.leaveFederation(federationId)
        } else {
            if (federation.hasWallet)
                await fedimint.leaveFederation(federationId)
            // for communities, the federation id is the invite code
            else fedimint.leaveCommunity({ inviteCode: federationId })
        }
    },
)

/*** Selectors ***/

export const selectLoadedFederations = createSelector(
    (s: CommonState) => s.federation.federations,
    federations =>
        federations.reduce((acc: LoadedFederation[], f: FederationListItem) => {
            if (f.init_state === 'ready') {
                const loadedFederation: LoadedFederation = {
                    ...f,
                    init_state: 'ready',
                    name: getFederationName(f),
                } as LoadedFederation
                acc.push(loadedFederation)
            }
            return acc
        }, []),
)

export const selectWalletFederations = createSelector(
    selectLoadedFederations,
    loadedFederations =>
        loadedFederations.flatMap(f => {
            // Only include wallet federations
            if (!f.hasWallet) return []

            return [
                {
                    ...f,
                    name: getFederationName(f),
                },
            ]
        }),
)

export const selectFederations = createSelector(
    (s: CommonState) => s.federation.federations,
    federations =>
        federations
            .map((f: FederationListItem) => {
                return {
                    ...f,
                    name: getFederationName(f),
                }
            })
            // We temporarily filter out failed federations until we have UI designs for this state
            .filter(f => f.init_state !== 'failed'),
)

export const selectAlphabeticallySortedFederations = createSelector(
    selectLoadedFederations,
    federations => {
        return orderBy(
            federations,
            federation => federation.name?.toLowerCase() || '',
            'asc',
        )
    },
)

export const selectFederationIds = createSelector(
    selectFederations,
    federations => federations.map(f => f.id),
)

export const selectActiveFederation = createSelector(
    selectLoadedFederations,
    (s: CommonState) => s.federation.activeFederationId,
    (federations, activeFederationId): LoadedFederation | undefined =>
        activeFederationId
            ? federations.find(f => f.id === activeFederationId) ||
              federations[0]
            : federations[0],
)

export const selectShouldShowDegradedStatus = createSelector(
    selectIsInternetUnreachable,
    (_s: CommonState, federation: FederationListItem | undefined) => federation,
    (isInternetUnreachable, federation) => {
        // dont show if there is a local internet problem
        if (isInternetUnreachable) return false
        const federationStatus =
            federation && 'status' in federation ? federation.status : undefined
        // dont show if we dont know the status yet
        if (!federationStatus) return false
        // dont show if the federation is online
        if (federationStatus === 'online') return false
        else return true
    },
)

export const selectFederation = (s: CommonState, id: string) =>
    selectFederations(s).find(f => f.id === id)

export const selectLoadedFederation = (s: CommonState, id: string) =>
    selectLoadedFederations(s).find(f => f.id === id)

export const selectActiveFederationId = (s: CommonState) => {
    return selectActiveFederation(s)?.id
}

export const selectPaymentFederation = createSelector(
    selectWalletFederations,
    selectActiveFederation,
    (s: CommonState) => s.federation.payFromFederationId,
    (
        federations,
        activeFederation,
        payFromFederationId,
    ): LoadedFederation | undefined => {
        if (!payFromFederationId) {
            return activeFederation?.hasWallet ? activeFederation : undefined
        }

        return federations.find(f => f.id === payFromFederationId)
    },
)

export const selectFederationClientConfig = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation && activeFederation.hasWallet
            ? activeFederation.clientConfig
            : null
    },
)

export const selectFederationStabilityPoolConfig = createSelector(
    selectFederationClientConfig,
    config => {
        if (!config) return null

        if ('modules' in config) {
            const { modules } = config as RpcJsonClientConfig
            for (const key in modules) {
                // TODO: add better typing for this
                const fmModule = modules[key] as Partial<{ kind: string }>
                if (fmModule.kind === 'stability_pool') {
                    return fmModule as RpcStabilityPoolConfig
                }
            }
        }
        return null
    },
)

export const selectFederationFeeSchedule = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation && activeFederation.hasWallet
            ? activeFederation.fediFeeSchedule
            : null
    },
)

export const selectEcashFeeSchedule = createSelector(
    selectFederationFeeSchedule,
    feeSchedule => {
        if (!feeSchedule) return null
        const { modules } = feeSchedule
        if ('mint' in modules) {
            return modules['mint']
        }
    },
)

export const selectStabilityPoolFeeSchedule = createSelector(
    selectFederationFeeSchedule,
    feeSchedule => {
        if (!feeSchedule) return null
        const { modules } = feeSchedule
        if ('stability_pool' in modules) {
            return modules['stability_pool']
        }
    },
)

export const selectFederationMetadata = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation ? activeFederation.meta : {}
    },
)

export const selectGlobalCommunityMeta = createSelector(
    (s: CommonState) => s.federation.externalMeta,
    externalMeta => externalMeta[FEDI_GLOBAL_COMMUNITY.id],
)

export const selectFederationBalance = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation && activeFederation.hasWallet
            ? activeFederation.balance
            : (0 as MSats)
    },
)

export const selectPaymentFederationBalance = createSelector(
    selectPaymentFederation,
    payFromFederation => {
        return payFromFederation ? payFromFederation.balance : (0 as MSats)
    },
)

export const selectIsActiveFederationRecovering = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation && activeFederation.hasWallet
            ? activeFederation.recovering
            : false
    },
)
export const selectFederationHasWallet = (federation: FederationListItem) =>
    federation.hasWallet

export const selectActiveFederationHasWallet = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation ? activeFederation.hasWallet : false
    },
)

export const selectIsAnyFederationRecovering = createSelector(
    selectLoadedFederations,
    federations => {
        return federations.some(f => f.hasWallet && f.recovering)
    },
)

export const selectFederationCustomFediMods = (
    s: CommonState,
    federationId: Federation['id'],
) => {
    const federation = selectLoadedFederation(s, federationId)
    return federation ? s.federation.customFediMods[federation?.id] || [] : []
}

export const selectActiveFederationCustomFediMods = (s: CommonState) => {
    const activeFederation = selectActiveFederation(s)
    return activeFederation
        ? s.federation.customFediMods[activeFederation?.id] || []
        : []
}

export const selectActiveFederationChats = (s: CommonState) => {
    const activeFederation = selectActiveFederation(s)
    return activeFederation
        ? s.federation.defaultCommunityChats[activeFederation.id] || []
        : []
}

export const selectMaxStableBalanceSats = createSelector(
    selectFederationMetadata,
    (metadata): Sats => {
        const maxStableBalanceMsats =
            metadata && getFederationMaxStableBalanceMsats(metadata)

        if (maxStableBalanceMsats === 0) return 0 as Sats

        return maxStableBalanceMsats
            ? amountUtils.msatToSat(maxStableBalanceMsats)
            : (0 as Sats)
    },
)

// For now we are setting a high default of 10 BTC unless otherwise
// specified by the federation feature flags. At some points we probably
// can remove this hard-coded value altogether
const MAX_INVOICE_AMOUNT_SATS = 1_000_000_000 as Sats
const MAX_BALANCE_AMOUNT_SATS = 1_000_000_000 as Sats

export const selectMaxInvoiceAmount = createSelector(
    selectFederationMetadata,
    metadata => {
        const maxInvoiceMsats =
            metadata && getFederationMaxInvoiceMsats(metadata)

        if (maxInvoiceMsats === 0) return 0 as Sats

        return maxInvoiceMsats
            ? amountUtils.msatToSat(maxInvoiceMsats)
            : MAX_INVOICE_AMOUNT_SATS
    },
)

export const selectMaxBalanceAmount = createSelector(
    selectFederationMetadata,
    metadata => {
        const maxBalanceMsats =
            metadata && getFederationMaxBalanceMsats(metadata)

        if (maxBalanceMsats === 0) return 0 as Sats

        return maxBalanceMsats
            ? amountUtils.msatToSat(maxBalanceMsats)
            : MAX_BALANCE_AMOUNT_SATS
    },
)

export const selectReceivesDisabled = createSelector(
    selectMaxInvoiceAmount,
    selectMaxBalanceAmount,
    selectFederationBalance,
    (maxReceiveAmount, maxBalanceAmount, balance) => {
        let receivesDisabled = false
        // Disable receives if maxInvoiceMsats is set to 0
        if (maxReceiveAmount === 0) {
            receivesDisabled = true
        }
        // Disable receives if balance exceeds maxBalanceMsats
        const balanceSats = amountUtils.msatToSat(balance as MSats)
        if (balanceSats >= maxBalanceAmount) {
            receivesDisabled = true
        }

        return receivesDisabled
    },
)

export const selectCommunityMods = createSelector(
    (s: CommonState) => s.federation.customFediMods,
    customFediMods => Object.values(customFediMods).flatMap(mods => mods ?? []),
)

export const selectActiveFederationFediMods = createSelector(
    (s: CommonState) => s.federation.activeFederationId,
    (s: CommonState) => s.federation.customFediMods,
    (activeFederationId, customFediMods) => {
        return activeFederationId
            ? customFediMods[activeFederationId] || []
            : []
    },
)

export const selectVisibleCommunityMods = createSelector(
    (s: CommonState) => s.federation.activeFederationId, // Get active federation ID
    (s: CommonState) => s.federation.customFediMods, // Get all community mods
    (s: CommonState) => s.mod.modVisibility, // Get mod visibility data
    (activeFederationId, customFediMods, modVisibility) => {
        if (!activeFederationId) return [] // If no active federation, return empty array

        // Get the mods for the active federation
        const activeFederationMods = customFediMods[activeFederationId] ?? []

        // Filter mods based on visibility, excluding hidden community mods
        return activeFederationMods.filter(mod => {
            const visibility = modVisibility[mod.id]
            return !visibility?.isHiddenCommunity // Show only visible community mods
        })
    },
)

export const selectFederationGroupChats = createSelector(
    selectFederationMetadata,
    getFederationGroupChats,
)

export const selectFederationWelcomeMessage = createSelector(
    selectFederationMetadata,
    getFederationWelcomeMessage,
)

export const selectFederationPinnedMessage = createSelector(
    selectFederationMetadata,
    getFederationPinnedMessage,
)
