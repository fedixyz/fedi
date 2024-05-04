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
    previewDefaultGroupChats,
} from '.'
import { FEDI_GLOBAL_COMMUNITY } from '../constants/community'
import {
    Federation,
    Guardian,
    MSats,
    PublicFederation,
    Sats,
    FediMod,
    MatrixRoom,
    FederationListItem,
    ClientConfigMetadata,
    Network,
} from '../types'
import { RpcJsonClientConfig, RpcStabilityPoolConfig } from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    getFederationGroupChats,
    getFederationMaxBalanceMsats,
    getFederationMaxInvoiceMsats,
    getFederationFediMods,
    fetchFederationsExternalMetadata,
    getFederationName,
    getFederationMaxStableBalanceMsats,
    coerceFederationListItem,
    joinFromInvite,
    getFederationWelcomeMessage,
    getFederationPinnedMessage,
} from '../utils/FederationUtils'
import type { FedimintBridge } from '../utils/fedimint'
import { makeChatFromPreview } from '../utils/matrix'
import { loadFromStorage } from './storage'

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
            state.federations = action.payload
        },
        setPublicFederations(state, action: PayloadAction<PublicFederation[]>) {
            state.publicFederations = action.payload
        },
        updateFederation(
            state,
            action: PayloadAction<Partial<FederationListItem>>,
        ) {
            // Only update the array if there were meaningful changes to the federation
            let hasUpdates = false
            const updatedFederations = state.federations.map(federation => {
                if (action.payload.id !== federation.id) return federation

                const updatedFederation = {
                    ...federation,
                    ...action.payload,

                    // TODO: update reducer to prevent updating a non-wallet
                    // community with wallet-only properties
                } as FederationListItem
                hasUpdates = !isEqual(federation, updatedFederation)
                return updatedFederation
            })
            if (hasUpdates) {
                state.federations = updatedFederations
            }
        },
        updateFederationBalance(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                balance: Federation['balance']
            }>,
        ) {
            const { federationId, balance } = action.payload
            const federation = state.federations.find(
                f => f.id === federationId,
            )
            // No-op if we don't have that federation or it's a
            // no-wallet community or balance has not changed
            if (
                !federation ||
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
        updateExternalMeta(
            state,
            action: PayloadAction<FederationState['externalMeta']>,
        ) {
            state.externalMeta = {
                ...state.externalMeta,
                ...action.payload,
            }
        },
        setFederationExternalMeta(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                meta: ClientConfigMetadata | undefined
            }>,
        ) {
            const { federationId, meta } = action.payload
            state.externalMeta = isEqual(meta, state.externalMeta[federationId])
                ? state.externalMeta
                : { ...state.externalMeta, [federationId]: meta }
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
    updateFederation,
    updateFederationBalance,
    setActiveFederationId,
    setPayFromFederationId,
    updateExternalMeta,
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
    const federations: FederationListItem[] = federationsList.map(f => ({
        ...f,
        network: f.network as Network,
        hasWallet: true as const,
    }))
    // TODO Check arguments for listCommunities
    const communities = await fedimint.listCommunities({})
    const communitiesAsFederations = communities.map(coerceFederationListItem)
    const externalMeta = await fetchFederationsExternalMetadata(
        // include the Fedi Global community used for the global announcements channel
        [...federations, ...communitiesAsFederations, FEDI_GLOBAL_COMMUNITY],
        (federationId, meta) => {
            dispatch(setFederationExternalMeta({ federationId, meta }))
        },
    )
    dispatch(updateExternalMeta(externalMeta))
    dispatch(setFederations([...federations, ...communitiesAsFederations]))
    return selectFederations(getState())
})

export const joinFederation = createAsyncThunk<
    FederationListItem,
    { fedimint: FedimintBridge; code: string },
    { state: CommonState }
>(
    'federation/joinFederation',
    async ({ fedimint, code }, { dispatch, getState }) => {
        const federation = await joinFromInvite(fedimint, code)

        await dispatch(refreshFederations(fedimint))
        dispatch(setActiveFederationId(federation.id))
        // matrix client should be initialized by now
        // so we can join default groups
        dispatch(previewDefaultGroupChats())

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

        // for communities, the federation id is the invite code
        if (!federation.hasWallet) {
            await fedimint.leaveCommunity({ inviteCode: federationId })
            return
        }

        // Fixes https://github.com/fedibtc/fedi/issues/3754
        const isRecovering = selectIsAnyFederationRecovering(getState())
        if (isRecovering || !federation)
            throw new Error('failed-to-leave-federation')

        if (federation.hasWallet) await fedimint.leaveFederation(federationId)
        // for communities, the federation id is the invite code
        else fedimint.leaveCommunity({ inviteCode: federationId })
    },
)

/*** Selectors ***/

export const selectWalletFederations = createSelector(
    (s: CommonState) => s.federation.federations,
    (s: CommonState) => s.federation.externalMeta,
    (federationListItems, externalMeta) =>
        federationListItems.flatMap(f => {
            // Only include wallet federations
            if (!f.hasWallet) return []

            const meta = externalMeta[f.id]
            if (!meta) return [f]

            return [
                {
                    ...f,
                    meta,
                    name: getFederationName(meta) || f.name,
                },
            ]
        }) as Federation[],
)

export const selectFederations = createSelector(
    (s: CommonState) => s.federation.federations,
    (s: CommonState) => s.federation.externalMeta,
    (federations, externalMeta) =>
        federations.map(f => {
            const meta = externalMeta[f.id]
            if (!meta) {
                return f
            }
            return {
                ...f,
                meta,
                name: getFederationName(meta) || f.name,
            }
        }),
)

export const selectAlphabeticallySortedFederations = createSelector(
    selectFederations,
    federations => {
        return orderBy(
            federations,
            federation => federation.name.toLowerCase(),
            'asc',
        )
    },
)

export const selectFederationIds = createSelector(
    selectFederations,
    federations => federations.map(f => f.id),
)

export const selectActiveFederation = createSelector(
    selectFederations,
    (s: CommonState) => s.federation.activeFederationId,
    (federations, activeFederationId): FederationListItem | undefined =>
        activeFederationId
            ? federations.find(f => f.id === activeFederationId) ||
              federations[0]
            : federations[0],
)

export const selectFederation = (s: CommonState, id: string) =>
    selectFederations(s).find(f => f.id === id)

export const selectActiveFederationId = (s: CommonState) => {
    return selectActiveFederation(s)?.id
}

export const selectPayFromFederation = createSelector(
    selectWalletFederations,
    selectActiveFederation,
    (s: CommonState) => s.federation.payFromFederationId,
    (
        federations,
        activeFederation,
        payFromFederationId,
    ): Federation | undefined => {
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

export const selectPayFromFederationBalance = createSelector(
    selectPayFromFederation,
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
    selectFederations,
    federations => {
        return federations.some(f => f.hasWallet && f.recovering)
    },
)

export const selectFederationCustomFediMods = (
    s: CommonState,
    federationId: Federation['id'],
) => {
    const federation = selectFederation(s, federationId)
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

export const selectActiveFederationFediMods = createSelector(
    selectActiveFederation,
    selectActiveFederationCustomFediMods,
    (federation, customFediMods) => {
        if (!federation) return []
        return [...getFederationFediMods(federation.meta), ...customFediMods]
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
