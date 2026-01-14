import {
    createAsyncThunk,
    createSelector,
    createSlice,
    PayloadAction,
} from '@reduxjs/toolkit'
import isEqual from 'lodash/isEqual'
import omit from 'lodash/omit'
import orderBy from 'lodash/orderBy'

import {
    CommonState,
    previewCommunityDefaultChats,
    previewFederationDefaultChats,
    selectFeatureFlags,
    selectIsInternetUnreachable,
    selectIsNostrClientEnabled,
} from '.'
import {
    Community,
    Federation,
    FediMod,
    Guardian,
    LoadedFederation,
    MatrixRoom,
    MSats,
    PublicCommunity,
    PublicFederation,
    Sats,
    StabilityPoolConfig,
} from '../types'
import {
    GuardianitoBot,
    RpcFederationId,
    RpcFederationPreview,
    RpcLightningGateway,
    RpcStabilityPoolConfig,
} from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    coerceLoadedFederation,
    getCommunityFediMods,
    getDefaultGroupChats,
    getFederationMaxBalanceMsats,
    getFederationMaxInvoiceMsats,
    getFederationMaxStableBalanceMsats,
    getFederationName,
    getFederationPinnedMessage,
    getFederationStatus,
    getFederationWelcomeMessage,
    hasMultispendModule,
    hasMultispendEnabled,
    coerceCommunity,
    shouldShowSocialRecovery,
    getAutojoinCommunities,
    getFederationPreview,
    getPreviewFromLoadedFederation,
} from '../utils/FederationUtils'
import type { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { makeChatFromUnjoinedRoomPreview } from '../utils/matrix'
import { upsertListItem } from '../utils/redux'
import { loadFromStorage } from './storage'

const log = makeLog('common/redux/federation')

/*** Initial State ***/

const initialState = {
    communities: [] as Community[],
    federations: [] as Federation[],
    publicCommunities: [] as PublicCommunity[],
    publicFederations: [] as PublicFederation[],
    payFromFederationId: null as Federation['id'] | null,
    recentlyUsedFederationIds: [] as Array<Federation['id']>,
    lastSelectedCommunityId: null as Community['id'] | null,
    authenticatedGuardian: null as Guardian | null,
    customFediMods: {} as Record<Federation['id'], FediMod[] | undefined>,
    defaultCommunityChats: {} as Record<Federation['id'], MatrixRoom[]>,
    gatewaysByFederation: {} as Record<Federation['id'], RpcLightningGateway[]>,
    // A list of federation IDs that we should not show the Federation Rating Overlay in again
    seenFederationRatings: [] as Array<Federation['id']>,
    // A map of community IDs to the timestamp of when we autojoined them
    previouslyAutojoinedCommunities: {} as Record<Community['id'], number>,
    // A list of community IDs that were autojoined where a dismissable notice should be displayed to the user
    autojoinNoticesToDisplay: [] as Array<Community['id']>,
    guardianitoBot: null as GuardianitoBot | null,
}

export type FederationState = typeof initialState

/*** Slice definition ***/

export const federationSlice = createSlice({
    name: 'federation',
    initialState,
    reducers: {
        setCommunities(state, action: PayloadAction<Community[]>) {
            let hasAnyUpdates = false

            const updatedCommunities = state.communities.reduce<Community[]>(
                (acc, existingCommunity) => {
                    const communityToUpsert = action.payload.find(
                        f => f.id === existingCommunity.id,
                    )
                    // Skip communities not in payload (they've been removed)
                    if (!communityToUpsert) {
                        hasAnyUpdates = true
                        return acc
                    }

                    const updatedCommunity: Community = {
                        ...existingCommunity,
                        ...communityToUpsert,
                    }
                    if ('meta' in communityToUpsert) {
                        // Merge meta objects, preserving existing fields
                        const mergedMeta = {
                            ...('meta' in existingCommunity
                                ? existingCommunity.meta
                                : {}),
                            ...communityToUpsert.meta,
                        }
                        updatedCommunity.meta = mergedMeta
                    }

                    const hasUpdates = !isEqual(
                        existingCommunity,
                        updatedCommunity,
                    )
                    if (hasUpdates) hasAnyUpdates = true

                    acc.push(hasUpdates ? updatedCommunity : existingCommunity)
                    return acc
                },
                [],
            )

            // Add new communities that don't exist in the current state
            const newCommunities = action.payload.filter(
                newCommunity =>
                    !state.communities.some(
                        existingCommunity =>
                            existingCommunity.id === newCommunity.id,
                    ),
            )

            if (newCommunities.length > 0) {
                hasAnyUpdates = true
            }

            // Only update state if there were changes
            if (hasAnyUpdates) {
                state.communities = [...updatedCommunities, ...newCommunities]
            }
        },
        setFederations(state, action: PayloadAction<Federation[]>) {
            let hasAnyUpdates = false

            const updatedFederations = state.federations.map(
                existingFederation => {
                    const federationToUpsert = action.payload.find(
                        f => f.id === existingFederation.id,
                    )
                    if (!federationToUpsert) return existingFederation
                    let updatedFederation: Federation

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
        setPublicCommunities(state, action: PayloadAction<PublicCommunity[]>) {
            state.publicCommunities = action.payload
        },
        setPublicFederations(state, action: PayloadAction<PublicFederation[]>) {
            state.publicFederations = action.payload
        },
        upsertCommunity(state, action: PayloadAction<Community>) {
            if (!action.payload.id) return
            state.communities = upsertListItem<Community>(
                state.communities,
                action.payload,
                ['meta'],
            )
        },
        upsertFederation(state, action: PayloadAction<Federation>) {
            if (!action.payload.id) return
            state.federations = upsertListItem<Federation>(
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
                federation.balance === balance
            )
                return
            state.federations = state.federations.map(f => {
                if (f.id !== federationId) return f
                return { ...f, balance }
            })
        },
        setPayFromFederationId(state, action: PayloadAction<string | null>) {
            state.payFromFederationId = action.payload
        },
        setLastUsedFederationId(state, action: PayloadAction<string>) {
            state.recentlyUsedFederationIds = Array.from(
                new Set([action.payload, ...state.recentlyUsedFederationIds]),
            )
        },
        setLastSelectedCommunityId(
            state,
            action: PayloadAction<string | null>,
        ) {
            state.lastSelectedCommunityId = action.payload
        },
        setCommunityCustomFediMods(
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
        addFederationGateways(
            state,
            action: PayloadAction<{
                federationId: string
                gateways: RpcLightningGateway[]
            }>,
        ) {
            state.gatewaysByFederation[action.payload.federationId] =
                action.payload.gateways
        },
        setSeenFederationRating(
            state,
            action: PayloadAction<{ federationId: string }>,
        ) {
            if (
                !state.seenFederationRatings.includes(
                    action.payload.federationId,
                )
            ) {
                state.seenFederationRatings = [
                    ...state.seenFederationRatings,
                    action.payload.federationId,
                ]
            }
        },
        setPreviouslyAutojoinedCommunity(
            state,
            action: PayloadAction<{
                communityId: Community['id']
            }>,
        ) {
            const { communityId } = action.payload

            state.previouslyAutojoinedCommunities = {
                ...state.previouslyAutojoinedCommunities,
                [communityId]: Date.now(),
            }
        },
        clearAutojoinedCommunitiesAndNotices(state) {
            state.previouslyAutojoinedCommunities = {}
            state.autojoinNoticesToDisplay = []
        },
        addAutojoinNoticeToDisplay(
            state,
            action: PayloadAction<{
                communityId: Community['id']
            }>,
        ) {
            if (
                !state.autojoinNoticesToDisplay.includes(
                    action.payload.communityId,
                )
            ) {
                state.autojoinNoticesToDisplay = [
                    ...state.autojoinNoticesToDisplay,
                    action.payload.communityId,
                ]
            }
        },
        removeAutojoinNoticeToDisplay(
            state,
            action: PayloadAction<{ communityId: Community['id'] }>,
        ) {
            state.autojoinNoticesToDisplay =
                state.autojoinNoticesToDisplay.filter(
                    id => id !== action.payload.communityId,
                )
        },
        setGuardianitoBot(state, action: PayloadAction<GuardianitoBot>) {
            state.guardianitoBot = action.payload
        },
        migrateCommunityV1ToV2(
            state,
            action: PayloadAction<{
                v1InviteCode: string
                v2Community: Community
            }>,
        ) {
            const { v1InviteCode, v2Community } = action.payload

            const v1Existed = state.communities.some(c => c.id === v1InviteCode)
            const v2Existed = state.communities.some(
                c => c.id === v2Community.id,
            )
            log.info(`migrateCommunityV1ToV2`, {
                v1InviteCode,
                v1Existed,
                v2Community,
                v2Existed,
            })

            // Remove v1 community from the list
            const filteredCommunities = state.communities.filter(
                c => c.id !== v1InviteCode,
            )

            // Add or update v2 community using existing upsert logic
            state.communities = upsertListItem<Community>(
                filteredCommunities,
                v2Community,
                ['meta'],
            )

            // Only update lastSelectedCommunityId if it was pointing to the migrated v1 community
            // This prevents unexpected behavior if the user switched to a different community
            // before the migration event fired
            if (state.lastSelectedCommunityId === v1InviteCode) {
                log.info(
                    `migrateCommunityV1ToV2: updating lastSelectedCommunityId from v1 to v2`,
                    { v1InviteCode, v2Community },
                )
                state.lastSelectedCommunityId = v2Community.id
            }
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
                state.payFromFederationId = null
            } else {
                // Remove `federationId` from the recently-used list
                state.recentlyUsedFederationIds =
                    state.recentlyUsedFederationIds.filter(
                        id => id !== federationId,
                    )

                // If there are no recently-used federations, set it to the first available federation (if any)
                if (
                    state.recentlyUsedFederationIds.length === 0 &&
                    state.federations.length > 0
                ) {
                    state.recentlyUsedFederationIds = Array.from(
                        new Set([
                            state.federations[0].id,
                            ...state.recentlyUsedFederationIds,
                        ]),
                    )
                }

                if (state.payFromFederationId === federationId) {
                    state.payFromFederationId =
                        state.recentlyUsedFederationIds[0] ?? null
                }
            }
            if (state.customFediMods[federationId]) {
                state.customFediMods = omit(state.customFediMods, federationId)
            }
        })
        builder.addCase(leaveCommunity.fulfilled, (state, action) => {
            const { communityId } = action.meta.arg
            // Remove from communities
            state.communities = state.communities.filter(
                fed => fed.id !== communityId,
            )
            // users cannot leave fedi global community
            // so if there is only one community left, set it as selected since it MUST be the global community
            if (state.communities.length === 1) {
                state.lastSelectedCommunityId = state.communities[0]?.id
            } else {
                // reset lastSelectedCommunityId if it was the one that was left
                if (state.lastSelectedCommunityId === communityId) {
                    state.lastSelectedCommunityId = state.communities[0]?.id
                }
            }
            // clear out any miniapps for this community
            if (state.customFediMods[communityId]) {
                state.customFediMods = omit(state.customFediMods, communityId)
            }
        })
        builder.addCase(createGuardianitoBot.fulfilled, (state, action) => {
            state.guardianitoBot = action.payload
        })

        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return
            state.recentlyUsedFederationIds =
                action.payload.recentlyUsedFederationIds
            state.lastSelectedCommunityId =
                action.payload.lastSelectedCommunityId
            state.authenticatedGuardian = action.payload.authenticatedGuardian
            state.customFediMods = action.payload.customFediMods || {}
            state.seenFederationRatings = action.payload.seenFederationRatings
            state.previouslyAutojoinedCommunities =
                action.payload.previouslyAutojoinedCommunities || {}
            state.autojoinNoticesToDisplay =
                action.payload.autojoinNoticesToDisplay || []
        })

        builder.addCase(
            previewCommunityDefaultChats.fulfilled,
            (state, action) => {
                const chatPreviews = action.payload.map(
                    makeChatFromUnjoinedRoomPreview,
                )
                const communityId = action.meta.arg.communityId
                state.defaultCommunityChats = isEqual(
                    chatPreviews,
                    state.defaultCommunityChats[communityId],
                )
                    ? state.defaultCommunityChats
                    : {
                          ...state.defaultCommunityChats,
                          [communityId]: chatPreviews,
                      }
            },
        )
    },
})

/*** Basic actions ***/

export const {
    setCommunities,
    setFederations,
    setPublicCommunities,
    setPublicFederations,
    upsertCommunity,
    upsertFederation,
    updateFederationBalance,
    setLastUsedFederationId,
    setLastSelectedCommunityId,
    setPayFromFederationId,
    setCommunityCustomFediMods,
    changeAuthenticatedGuardian,
    removeCustomFediMod,
    addFederationGateways,
    setSeenFederationRating,
    setPreviouslyAutojoinedCommunity,
    clearAutojoinedCommunitiesAndNotices,
    addAutojoinNoticeToDisplay,
    removeAutojoinNoticeToDisplay,
    setGuardianitoBot,
    migrateCommunityV1ToV2,
} = federationSlice.actions

/*** Async thunk actions */

export const rateFederation = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; rating: number; federationId: RpcFederationId },
    { state: CommonState }
>(
    'federation/rateFederation',
    async ({ fedimint, rating, federationId }, { dispatch }) => {
        if (!federationId) return

        try {
            log.debug(`rating federation ${federationId} with rating ${rating}`)
            await fedimint.nostrRateFederation(federationId, rating, false)
            log.debug(`adding ${federationId} to seenFederationRatings state`)
            dispatch(
                setSeenFederationRating({
                    federationId,
                }),
            )
        } catch (e) {
            log.error(`nostrRateFederation failed`, e)
        }
    },
)

export const supportsSafeOnchainDeposit = createAsyncThunk<
    boolean,
    { fedimint: FedimintBridge; federationId: Federation['id'] },
    { state: CommonState }
>(
    'federation/supportsSafeOnchainDeposit',
    ({ fedimint, federationId }, { getState }) => {
        // TODO: replace with federationId as param (or paymentFederation?)
        const federation = selectLoadedFederation(getState(), federationId)

        if (!federation) return false

        return fedimint.supportsSafeOnchainDeposit(federation.id)
    },
)

export const refreshCommunities = createAsyncThunk<
    Community[],
    FedimintBridge,
    { state: CommonState }
>('federation/refreshCommunities', async (fedimint, { dispatch, getState }) => {
    const communities = await fedimint.listCommunities({})
    log.info(`refreshing ${communities.length} communities`)

    // add inviteCode as ID and process meta for each community
    const communityListItems = communities.map(coerceCommunity)
    dispatch(setCommunities(communityListItems))
    const state = getState()
    const joinedCommunities = selectCommunities(state)
    log.info(`processing meta for ${joinedCommunities.length} communities`)
    joinedCommunities.map(community => {
        if (
            'meta' in community &&
            community.meta &&
            Object.keys(community.meta).length > 0
        ) {
            dispatch(
                processCommunityMeta({
                    fedimint,
                    community,
                }),
            )
        }
    })
    // there should always be a lastSelectedCommunityId for new users who join communities
    // but existing users who upgrade after joining communities won't have this so we set it here
    if (
        joinedCommunities.length > 0 &&
        !state.federation.lastSelectedCommunityId
    ) {
        log.debug(
            'making sure the user has a lastSelectedCommunityId set: ',
            joinedCommunities[0]?.id,
        )
        dispatch(setLastSelectedCommunityId(joinedCommunities[0].id))
    }
    // users must always be joined to the default un-leaveable global community
    await dispatch(ensureDefaultCommunityIsJoined({ fedimint }))

    return joinedCommunities
})

export const refreshFederations = createAsyncThunk<
    Federation[],
    FedimintBridge,
    { state: CommonState }
>('federation/refreshFederations', async (fedimint, { dispatch, getState }) => {
    const federationsList = await fedimint.listFederations()

    log.info(`refreshing ${federationsList.length} federations`)

    const federations: Federation[] = federationsList.map(f => {
        switch (f.init_state) {
            case 'loading':
            case 'failed':
                return f
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

    dispatch(setFederations(federations))

    // Process federation metadata for default chats
    log.info(`processing meta for ${federations.length} federations`)
    federations.map(federation => {
        if (
            'meta' in federation &&
            federation.meta &&
            Object.keys(federation.meta).length > 0
        ) {
            dispatch(
                processFederationMeta({
                    fedimint,
                    federation,
                }),
            )
        }
    })

    // there should always be a lastUsedFederation for new users who join federations
    // but existing users who upgrade after joining federations won't have this so we set it here
    if (!selectLastUsedFederationId(getState())) {
        const firstFederationId = federations[0]?.id
        log.info(
            'no lastUsedFederationId, setting to first federation: ',
            firstFederationId,
        )
        if (firstFederationId) {
            dispatch(setLastUsedFederationId(firstFederationId))
        }
    }

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

export const processCommunityMeta = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; community: Pick<Community, 'id' | 'meta'> },
    { state: CommonState }
>(
    'federation/processCommunityMeta',
    async ({ fedimint, community }, { dispatch }) => {
        if (!community.meta) return

        // fedimods & default chats are derived from the federation meta
        dispatch(
            setCommunityCustomFediMods({
                federationId: community.id,
                mods: getCommunityFediMods(community.meta),
            }),
        )

        // note: matrix may not be initialized yet so this may fail gracefully
        // but the startMatrixClient thunk will call previewAllDefaultChats and make
        // sure all loaded communities get their default chats previewed
        dispatch(
            previewCommunityDefaultChats({
                fedimint,
                communityId: community.id,
            }),
        )
    },
)

export const processFederationMeta = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; federation: Pick<Federation, 'id' | 'meta'> },
    { state: CommonState }
>(
    'federation/processFederationMeta',
    async ({ fedimint, federation }, { dispatch }) => {
        if (!federation.meta) return

        // note: matrix may not be initialized yet so this may fail gracefully
        // but the startMatrixClient thunk will call previewAllDefaultChats and make
        // sure all loaded federations get their default chats previewed
        dispatch(
            previewFederationDefaultChats({
                fedimint,
                federationId: federation.id,
            }),
        )
    },
)

// checks if we already have a preview for a federation and if we are a member.
// if we don't have a preview, we fetch it.
export const checkFederationPreview = createAsyncThunk<
    { preview: RpcFederationPreview; isMember: boolean },
    { fedimint: FedimintBridge; inviteCode: string },
    { state: CommonState }
>(
    'federation/checkFederationPreview',
    async ({ fedimint, inviteCode }, { getState }) => {
        const { federationId } = await fedimint.parseInviteCode(inviteCode)
        const joinedFederation = selectLoadedFederation(
            getState(),
            federationId,
        )
        if (joinedFederation) {
            return {
                preview: getPreviewFromLoadedFederation(joinedFederation),
                isMember: true,
            }
        }
        const preview = await getFederationPreview(inviteCode, fedimint)
        return { preview, isMember: false }
    },
)

// this checks all meta in joined federations for communities that should be autojoined
// and then sets the community as last selected to bring more attention
// to the user that autojoin happened in the background
export const checkJoinedFederationsForAutojoinCommunities = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
    },
    { state: CommonState }
>(
    'federation/checkJoinedFederationsForAutojoinCommunities',
    async ({ fedimint }, { getState, dispatch }) => {
        const federations = selectLoadedFederations(getState())

        await Promise.all(
            federations.map(f => {
                return dispatch(
                    checkFederationForAutojoinCommunities({
                        fedimint,
                        federation: f,
                        setAsSelected: false,
                    }),
                )
            }),
        )
    },
)
export const checkFederationForAutojoinCommunities = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federation: Federation
        setAsSelected?: boolean
    },
    { state: CommonState }
>(
    'federation/checkFederationForAutojoinCommunities',
    async ({ fedimint, federation, setAsSelected = false }, { dispatch }) => {
        if (!federation.meta) return
        const autojoinCommunities = getAutojoinCommunities(federation.meta)

        await Promise.all(
            autojoinCommunities.map(code => {
                return dispatch(
                    autojoinCommunity({ fedimint, code, setAsSelected }),
                )
            }),
        )
    },
)

// if not already joined, auto-join the default fedi global community and set it as selected
export const ensureDefaultCommunityIsJoined = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>(
    'federation/ensureDefaultCommunityIsJoined',
    async ({ fedimint }, { getState, dispatch }) => {
        const state = getState()
        const defaultCommunityInviteCode = selectGlobalCommunityInvite(state)

        // this should never happen since it comes from the bridge feature flags
        if (!defaultCommunityInviteCode) {
            log.warn('no default community invite code found')
            return
        }
        const joinedCommunities = selectCommunities(state)
        if (!joinedCommunities.find(c => c.id === defaultCommunityInviteCode)) {
            log.debug('fedi global community not joined, joining...')
            const joinedCommunity = await dispatch(
                joinCommunity({ fedimint, code: defaultCommunityInviteCode }),
            ).unwrap()

            dispatch(setCommunities([joinedCommunity, ...joinedCommunities]))
            dispatch(
                processCommunityMeta({ fedimint, community: joinedCommunity }),
            )
            dispatch(setLastSelectedCommunityId(defaultCommunityInviteCode))
        }
    },
)

export const autojoinCommunity = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; code: string; setAsSelected?: boolean },
    { state: CommonState }
>(
    'federation/autojoinCommunity',
    async (
        { fedimint, code, setAsSelected = false },
        { dispatch, getState },
    ) => {
        log.info(
            `autojoinCommunity: checking if weve joined community '${code}'`,
        )
        const previouslyAutojoinedCommunities =
            getState().federation.previouslyAutojoinedCommunities
        if (previouslyAutojoinedCommunities[code]) {
            log.info(
                `autojoinCommunity: weve already autojoined community '${code}'`,
            )
            return
        }
        try {
            const joinedCommunity = await dispatch(
                joinCommunity({ fedimint, code }),
            ).unwrap()
            // for new members joining, use setAsSelected: true to bring more attention that the autojoin happened
            // for existing members, don't select so the autojoin is more silent
            if (setAsSelected) {
                dispatch(setLastSelectedCommunityId(joinedCommunity.id))
            }
            log.info(
                `autojoin succeeded, setting community as previously autojoined`,
                joinedCommunity.name,
            )
            // this makes sure we only autojoin once
            // but we only set this if the join succeeds since we may be offline...
            await dispatch(
                setPreviouslyAutojoinedCommunity({ communityId: code }),
            )
            // for existing members, we need to show a dismissable notice explaining the autojoin
            if (setAsSelected === false) {
                dispatch(
                    addAutojoinNoticeToDisplay({
                        communityId: joinedCommunity.id,
                    }),
                )
            }
            // finally refresh communities to update the list and keep meta fresh
            dispatch(refreshCommunities(fedimint))
        } catch (error) {
            log.error(
                `autojoinCommunity: error joining community '${code}':`,
                error,
            )
        }
    },
)

export const joinFederation = createAsyncThunk<
    Federation,
    { fedimint: FedimintBridge; code: string; recoverFromScratch?: boolean },
    { state: CommonState }
>(
    'federation/joinFederation',
    async (
        { fedimint, code, recoverFromScratch = false },
        { getState, dispatch },
    ) => {
        log.info(
            `joinFederation: joining federation with code '${code}' / recoverFromScratch: ${recoverFromScratch}`,
        )
        const joinResult = await fedimint.joinFederation(
            code,
            recoverFromScratch,
        )
        const status = await getFederationStatus(fedimint, joinResult.id)
        const federation = {
            ...joinResult,
            status,
            init_state: 'ready',
        }

        const joinedFederation = selectFederation(getState(), federation.id)
        if (!joinedFederation) throw new Error('errors.unknown-error')

        dispatch(setLastUsedFederationId(joinedFederation.id))
        return joinedFederation
    },
)

export const joinCommunity = createAsyncThunk<
    Community,
    { fedimint: FedimintBridge; code: string }
>('federation/joinCommunity', async ({ fedimint, code }) => {
    log.info(`joinCommunity: joining community with code '${code}'`)
    const joinResult = await fedimint.joinCommunity({ inviteCode: code })
    const community = coerceCommunity(joinResult)
    return community
})

export const tryRejoinFederationsPendingScratchRejoin = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('federation/rejoinFederations', async ({ fedimint }, { dispatch }) => {
    const federationsFailed =
        await fedimint.listFederationsPendingRejoinFromScratch()

    for (const federationInvite of federationsFailed) {
        dispatch(
            joinFederation({
                fedimint,
                code: federationInvite,
                recoverFromScratch: true,
            }),
        )
    }
})

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

        await fedimint.leaveFederation(federationId)
    },
)

export const leaveCommunity = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; communityId: Community['id'] },
    { state: CommonState }
>(
    'federation/leaveCommunity',
    async ({ fedimint, communityId }, { getState }) => {
        const community = selectCommunity(getState(), communityId)
        if (!community) throw new Error('failed-to-leave-community')

        await fedimint.leaveCommunity({ inviteCode: communityId })
    },
)

export const setSuggestedPaymentFederation = createAsyncThunk<
    void,
    void,
    { state: CommonState }
>(
    'federation/setSuggestedPaymentFederation',
    async (_, { getState, dispatch }) => {
        const state = getState()
        const paymentFederation = selectPaymentFederation(state)
        const walletFederations = selectLoadedFederations(state)

        // If no payment federation is set (e.g. your active federation is a non-wallet community),
        // find and select the best possible wallet federation
        if (!paymentFederation) {
            const firstWalletFederation = walletFederations
                // Sort by balance
                .sort((a, b) => b.balance - a.balance)
                // Prioritize mainnet federations
                .sort(
                    (a, b) =>
                        // Resolves to either 0 or 1 for true/false
                        // Sorts in descending order by network === bitcoin - network !== bitcoin
                        Number(b.network === 'bitcoin') -
                        Number(a.network === 'bitcoin'),
                )[0]

            dispatch(setPayFromFederationId(firstWalletFederation?.id ?? null))
        }
    },
)

export const listGateways = createAsyncThunk<
    {
        nodePubKey: string
        gatewayId: string
        api: string
        active: boolean
    }[],
    { fedimint: FedimintBridge; federationId: string },
    { state: CommonState }
>(
    'federation/listGateways',
    async ({ fedimint, federationId }, { dispatch, getState }) => {
        const gatewaysByFederation = selectGatewaysByFederation(getState())
        const federationGateway = gatewaysByFederation[federationId]

        if (federationGateway) {
            return federationGateway
        }

        const gateways = await fedimint.listGateways(federationId)

        dispatch(addFederationGateways({ federationId, gateways }))

        return gateways
    },
)

export const createGuardianitoBot = createAsyncThunk<
    GuardianitoBot,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('federation/createGuardianitoBot', async ({ fedimint }) => {
    const guardianitoBot = await fedimint.guardianitoGetOrCreateBot()
    log.debug('createGuardianitoBot guardianitoBot', guardianitoBot)

    return guardianitoBot
})

/*** Selectors ***/

export const selectLoadedFederations = createSelector(
    (s: CommonState) => s.federation.federations,
    federations =>
        federations.reduce((acc: LoadedFederation[], f: Federation) => {
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

export const selectRecentlyUsedFederationIds = (s: CommonState) =>
    s.federation.recentlyUsedFederationIds

export const selectLastUsedFederationId = (s: CommonState) =>
    selectRecentlyUsedFederationIds(s)[0] ?? null

// non-featured federations are just loaded federations excluding the last used federation
export const selectNonFeaturedFederations = createSelector(
    selectLastUsedFederationId,
    selectRecentlyUsedFederationIds,
    selectLoadedFederations,
    (lastUsedFederationId, recentlyUsedFederationIds, federations) => {
        const federationList = lastUsedFederationId
            ? federations.filter(f => f.id !== lastUsedFederationId)
            : federations

        // Sort non-featured federations based on the when they were last-used in recentlyUsedFederationIds
        federationList.sort((a, b) => {
            const recentIndexA = recentlyUsedFederationIds.indexOf(a.id)
            const recentIndexB = recentlyUsedFederationIds.indexOf(b.id)

            // If not found in the recently-used federation list, bump it to the end of the list
            const compareA =
                recentIndexA === -1 ? federationList.length : recentIndexA
            const compareB =
                recentIndexB === -1 ? federationList.length : recentIndexB

            return compareA - compareB
        })

        return federationList
    },
)

export const selectFederations = createSelector(
    (s: CommonState) => s.federation.federations,
    federations =>
        federations
            .map((f: Federation) => {
                return {
                    ...f,
                    name: getFederationName(f),
                }
            })
            // We temporarily filter out failed federations until we have UI designs for this state
            .filter(f => f.init_state !== 'failed'),
)

export const selectCommunities = (s: CommonState) => s.federation.communities

export const selectCommunityIds = createSelector(
    selectCommunities,
    communities => communities.map(c => c.id),
)

export const selectCommunity = (s: CommonState, id: string) =>
    selectCommunities(s).find(c => c.id === id)

export const selectLastSelectedCommunity = createSelector(
    selectCommunities,
    (s: CommonState) => s.federation.lastSelectedCommunityId,
    (communities, lastSelectedCommunityId): Community | undefined =>
        lastSelectedCommunityId
            ? communities.find(c => c.id === lastSelectedCommunityId)
            : communities[0],
)

// Users cannot leave the default global community
export const selectCanLeaveCommunity = createSelector(
    (s: CommonState, communityId: Community['id']) =>
        selectCommunity(s, communityId),
    (s: CommonState, _communityId: Community['id']) =>
        selectGlobalCommunityInvite(s),
    (community, globalCommunityInvite) =>
        community?.id !== globalCommunityInvite,
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

export const selectAlphabeticallySortedWalletFederations = createSelector(
    selectLoadedFederations,
    federations => {
        return orderBy(
            federations,
            federation => federation.name?.toLowerCase() || '',
            'asc',
        )
    },
)

export const selectAlphabeticallySortedCommunities = createSelector(
    selectCommunities,
    communities => {
        return orderBy(
            communities,
            community => community.name?.toLowerCase() || '',
            'asc',
        )
    },
)

export const selectFederationIds = createSelector(
    selectFederations,
    federations => federations.map(f => f.id),
)

export const selectShouldShowDegradedStatus = createSelector(
    (s: CommonState) => selectIsInternetUnreachable(s),
    (_s: CommonState, federation: Federation | undefined) => federation,
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

export const selectLastUsedFederation = createSelector(
    selectLoadedFederations,
    selectLastUsedFederationId,
    (federations, lastUsedFederationId): LoadedFederation | undefined =>
        lastUsedFederationId
            ? federations.find(f => f.id === lastUsedFederationId) ||
              federations[0]
            : federations[0],
)

export const selectReusedEcashFederations = createSelector(
    selectLoadedFederations,
    federations => {
        return federations.filter(f => f.hadReusedEcash)
    },
)

export const selectPaymentFederation = createSelector(
    selectLoadedFederations,
    selectLastUsedFederation,
    (s: CommonState) => s.federation.payFromFederationId,
    (
        federations,
        lastUsedFederation,
        payFromFederationId,
    ): LoadedFederation | undefined => {
        if (!payFromFederationId) {
            if (lastUsedFederation) return lastUsedFederation

            if (federations.length > 0) return federations[0]

            return undefined
        }

        return federations.find(f => f.id === payFromFederationId)
    },
)

export const selectFederationClientConfig = createSelector(
    (s: CommonState, federationId: string) =>
        selectLoadedFederation(s, federationId),
    federation => {
        return federation && 'clientConfig' in federation
            ? federation.clientConfig
            : null
    },
)

export const selectFederationStabilityPoolConfig = createSelector(
    (s: CommonState, federationId: string) =>
        selectFederationClientConfig(s, federationId),
    config => {
        if (!config || !('modules' in config)) return null

        const { modules } = config
        for (const key in modules) {
            // TODO: add better typing for this
            const fmModule = modules[key] as Partial<{ kind: string }>

            // Stability pool v2
            if (fmModule.kind === 'multi_sig_stability_pool') {
                return {
                    ...(fmModule as RpcStabilityPoolConfig),
                    version: 2,
                } satisfies StabilityPoolConfig
            }

            // Stability pool v1
            if (fmModule.kind === 'stability_pool') {
                return {
                    ...(fmModule as RpcStabilityPoolConfig),
                    version: 1,
                } satisfies StabilityPoolConfig
            }
        }

        return null
    },
)

export const selectFederationFeeSchedule = createSelector(
    (s: CommonState, federationId: string) =>
        selectLoadedFederation(s, federationId),
    federation => {
        return federation ? federation.fediFeeSchedule : null
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
        } else if ('multi_sig_stability_pool' in modules) {
            return modules['multi_sig_stability_pool']
        }
    },
)

export const selectCommunityMetadata = createSelector(
    (s: CommonState, communityId: Community['id']) =>
        selectCommunity(s, communityId),
    community => {
        return community ? community.meta : {}
    },
)

export const selectGlobalCommunityInvite = createSelector(
    (s: CommonState) => selectFeatureFlags(s),
    featureFlags => {
        return featureFlags?.global_community?.invite_code
    },
)

export const selectGlobalCommunityMetadata = createSelector(
    (s: CommonState) => selectGlobalCommunityInvite(s),
    (s: CommonState) => s,
    (globalCommunityInvite, s) => {
        // this should never happen since it comes from the bridge feature flags
        if (!globalCommunityInvite) return undefined
        return selectCommunityMetadata(s, globalCommunityInvite)
    },
)

export const selectFederationMetadata = createSelector(
    (s: CommonState, federationId: Federation['id']) =>
        selectLoadedFederation(s, federationId),
    federation => {
        return federation ? federation.meta : {}
    },
)

export const selectFederationBalance = createSelector(
    (s: CommonState, federationId: Federation['id']) =>
        selectLoadedFederation(s, federationId),
    federation => {
        return federation ? federation.balance : (0 as MSats)
    },
)

export const selectPaymentFederationBalance = createSelector(
    selectPaymentFederation,
    payFromFederation => {
        return payFromFederation ? payFromFederation.balance : (0 as MSats)
    },
)

export const selectIsFederationRecovering = createSelector(
    (s: CommonState, federationId: Federation['id']) =>
        selectLoadedFederation(s, federationId),
    federation => {
        return federation?.recovering ?? false
    },
)

export const selectIsAnyFederationRecovering = createSelector(
    selectLoadedFederations,
    federations => {
        return federations.some(f => f.recovering)
    },
)

export const selectAreAllFederationsRecovering = createSelector(
    selectLoadedFederations,
    federations => {
        return (
            federations.length > 0 &&
            federations.find(f => !f.recovering) === undefined
        )
    },
)

export const selectDoesAnyFederationHaveSocialBackup = createSelector(
    selectLoadedFederations,
    federations => {
        return federations.some(f => shouldShowSocialRecovery(f))
    },
)

export const selectLastSelectedCommunityChats = createSelector(
    selectLastSelectedCommunity,
    (s: CommonState) => s.federation.defaultCommunityChats,
    (lastSelectedCommunity, defaultCommunityChats) =>
        lastSelectedCommunity
            ? defaultCommunityChats[lastSelectedCommunity.id] || []
            : [],
)

export const selectDefaultChats = (s: CommonState, federationId: string) => {
    return s.federation.defaultCommunityChats[federationId] || []
}

export const selectMaxStableBalanceSats = createSelector(
    selectFederationMetadata,
    (metadata): Sats | undefined => {
        const maxStableBalanceMsats =
            metadata && getFederationMaxStableBalanceMsats(metadata)

        if (maxStableBalanceMsats === 0) return 0 as Sats

        return maxStableBalanceMsats
            ? amountUtils.msatToSat(maxStableBalanceMsats)
            : undefined
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

export const selectCommunityModsById = (
    state: CommonState,
    federationId: string,
) => {
    return federationId
        ? state.federation.customFediMods[federationId] || []
        : []
}

export const selectFederationGroupChats = createSelector(
    selectFederationMetadata,
    getDefaultGroupChats,
)

export const selectFederationWelcomeMessage = createSelector(
    selectFederationMetadata,
    getFederationWelcomeMessage,
)

export const selectFederationPinnedMessage = createSelector(
    selectFederationMetadata,
    getFederationPinnedMessage,
)

export const selectGatewaysByFederation = (state: CommonState) =>
    state.federation.gatewaysByFederation

export const selectDoesAnyFederationHaveMultispend = createSelector(
    selectLoadedFederations,
    federations => {
        if (federations.length === 0) return false

        return federations.some(federation => {
            return (
                hasMultispendModule(federation) &&
                hasMultispendEnabled(federation.meta)
            )
        })
    },
)

export const selectDoesFederationHaveMultispend = (
    state: CommonState,
    federationId: string,
) => {
    const federation = selectLoadedFederation(state, federationId)

    if (!federation) return false

    return Boolean(
        hasMultispendModule(federation) &&
            hasMultispendEnabled(federation.meta),
    )
}

export const selectShouldShowMultispend = (s: CommonState) =>
    selectDoesAnyFederationHaveMultispend(s)

export const selectHasSeenFederationRating = (
    state: CommonState,
    federationId: string,
) => state.federation.seenFederationRatings.includes(federationId)

export const selectShouldRateFederation = createSelector(
    (s: CommonState) => s.federation.seenFederationRatings,
    (s: CommonState) => selectIsNostrClientEnabled(s),
    (s: CommonState) => selectPaymentFederation(s),
    (seenFederationRatings, isNostrClientEnabled, paymentFederation) => {
        log.debug('selectShouldRateFederation', {
            seenFederationRatings,
            isNostrClientEnabled,
            paymentFederation: `${paymentFederation?.id} - ${paymentFederation?.name}`,
        })
        // dont rate if the user has no wallet federations
        if (!paymentFederation) return false
        // dont rate if the user has already rated this federation
        if (seenFederationRatings.includes(paymentFederation.id)) return false
        // dont rate if nostr client is not enabled
        if (!isNostrClientEnabled) return false
        return true
    },
)

export const selectAuthenticatedGuardian = (s: CommonState) =>
    s.federation.authenticatedGuardian

// Selects up to three communities, the selected community being the first
export const selectCommunityStack = createSelector(
    selectCommunities,
    selectLastSelectedCommunity,
    (communities, lastSelectedCommunity) => {
        const selectedCommunity = lastSelectedCommunity
        if (!selectedCommunity) return []
        const nonSelectedCommunities = communities.filter(
            c => c.id !== selectedCommunity.id,
        )
        return [selectedCommunity, ...nonSelectedCommunities.slice(0, 2)]
    },
)

// Aggregates the total balance in msats across all federation wallets
export const selectTotalBalanceMsats = createSelector(
    selectLoadedFederations,
    federations => {
        const totalBalanceMsats = federations.reduce((acc, federation) => {
            return acc + federation.balance
        }, 0) as MSats
        return totalBalanceMsats
    },
)

export const selectFederationByAutojoinCommunityId = createSelector(
    (s: CommonState, communityId: string) => communityId,
    (s: CommonState, _communityId: string) => selectLoadedFederations(s),
    (communityId, loadedFederations) => {
        return loadedFederations.find(federation => {
            const autojoinCommunities = getAutojoinCommunities(federation.meta)
            return autojoinCommunities.includes(communityId)
        })
    },
)

export const selectShouldShowAutojoinedCommunityNotice = createSelector(
    (_: CommonState, communityId: string) => communityId,
    (s: CommonState, _communityId: string) =>
        s.federation.autojoinNoticesToDisplay,
    (s: CommonState, communityId: string) =>
        selectFederationByAutojoinCommunityId(s, communityId),
    (
        communityId,
        autojoinNoticesToDisplay,
        federationWithAutojoinCommunity,
    ) => {
        // make sure the community id is found in a joined federations meta
        return (
            autojoinNoticesToDisplay.includes(communityId) &&
            !!federationWithAutojoinCommunity
        )
    },
)

export const selectShouldShowAutojoinedNoticeForFederation = createSelector(
    (s: CommonState, federationId: Federation['id']) =>
        selectLoadedFederation(s, federationId),
    (s: CommonState, _communityId: string) =>
        s.federation.autojoinNoticesToDisplay,
    (federation, autojoinNoticesToDisplay) => {
        if (!federation?.meta) return false
        const autojoinCommunities = getAutojoinCommunities(federation.meta)
        if (autojoinCommunities.length === 0) return false
        if (autojoinNoticesToDisplay.length === 0) return false
        return autojoinNoticesToDisplay.some(communityId =>
            autojoinCommunities.includes(communityId),
        )
    },
)

export const selectAutojoinNoticeInfo = createSelector(
    (
        s: CommonState,
        communityId?: Community['id'],
        federationId?: Federation['id'],
    ) => ({
        communityId,
        federationId,
    }),
    (s: CommonState) => selectLoadedFederations(s),
    (s: CommonState) => s,
    ({ communityId, federationId }, loadedFederations, state) => {
        if (!communityId && !federationId) return null
        // if communityId is provided, use the existing selector to find the federation
        if (communityId) {
            return {
                federation: selectFederationByAutojoinCommunityId(
                    state,
                    communityId,
                ),
                autojoinedCommunityId: communityId,
            }
        }
        // if federationId is provided, get the federation & extract the community ID from meta
        if (federationId) {
            const federation = loadedFederations.find(
                f => f.id === federationId,
            )
            if (federation) {
                const autojoinCommunities = getAutojoinCommunities(
                    federation.meta || {},
                )
                // for now just return the first autojoin community
                return {
                    federation,
                    autojoinedCommunityId: autojoinCommunities[0],
                }
            }
        }
    },
)

export const selectGuardianitoBot = (s: CommonState) =>
    s.federation.guardianitoBot
