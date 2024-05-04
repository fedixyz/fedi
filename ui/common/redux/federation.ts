import {
    createAsyncThunk,
    createSelector,
    createSlice,
    PayloadAction,
} from '@reduxjs/toolkit'
import isEqual from 'lodash/isEqual'
import omit from 'lodash/omit'

import { CommonState } from '.'
import {
    Federation,
    Guardian,
    MSats,
    PublicFederation,
    Sats,
    SeedWords,
    FediMod,
} from '../types'
import { RpcJsonClientConfig, RpcStabilityPoolConfig } from '../types/bindings'
import amountUtils from '../utils/AmountUtils'
import {
    getFederationGroupChats,
    getFederationMaxBalanceMsats,
    getFederationMaxInvoiceMsats,
    getFederationFediMods,
    fetchFederationsExternalMetadata,
    getFederationChatServerDomain,
    getFederationName,
    getFederationMaxStableBalanceMsats,
} from '../utils/FederationUtils'
import type { FedimintBridge } from '../utils/fedimint'
import { loadFromStorage } from './storage'

/*** Initial State ***/

const initialState = {
    federations: [] as Federation[],
    publicFederations: [] as PublicFederation[],
    activeFederationId: null as string | null,
    authenticatedGuardian: null as Guardian | null,
    externalMeta: {} as Record<
        Federation['id'],
        Federation['meta'] | undefined
    >,
    customFediMods: {} as Record<Federation['id'], FediMod[] | undefined>,
}

export type FederationState = typeof initialState

/*** Slice definition ***/

export const federationSlice = createSlice({
    name: 'federation',
    initialState,
    reducers: {
        setFederations(state, action: PayloadAction<Federation[]>) {
            state.federations = action.payload
        },
        setPublicFederations(state, action: PayloadAction<PublicFederation[]>) {
            state.publicFederations = action.payload
        },
        updateFederation(state, action: PayloadAction<Partial<Federation>>) {
            // Only update the array if there were meaningful changes to the federation
            let hasUpdates = false
            const updatedFederations = state.federations.map(federation => {
                if (action.payload.id !== federation.id) return federation

                const updatedFederation = {
                    ...federation,
                    ...action.payload,
                }
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
            // No-op if we don't have that federation, or balance has not changed
            if (!federation || federation.balance === balance) return
            state.federations = state.federations.map(f => {
                if (f.id !== federationId) return f
                return { ...f, balance }
            })
        },
        setActiveFederationId(state, action: PayloadAction<string | null>) {
            state.activeFederationId = action.payload
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
                meta: Federation['meta'] | undefined
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
        addCustomFediMod(
            state,
            action: PayloadAction<{
                federationId: Federation['id']
                fediMod: FediMod
            }>,
        ) {
            const { federationId, fediMod } = action.payload
            const fediMods = state.customFediMods[federationId] || []
            state.customFediMods[federationId] = [...fediMods, fediMod]
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
    },
})

/*** Basic actions ***/

export const {
    setFederations,
    setPublicFederations,
    updateFederation,
    updateFederationBalance,
    setActiveFederationId,
    updateExternalMeta,
    setFederationExternalMeta,
    changeAuthenticatedGuardian,
    addCustomFediMod,
    removeCustomFediMod,
} = federationSlice.actions

/*** Async thunk actions */

export const refreshFederations = createAsyncThunk<
    Federation[],
    FedimintBridge,
    { state: CommonState }
>('federation/refreshFederations', async (fedimint, { dispatch, getState }) => {
    const federations = await fedimint.listFederations()
    const externalMeta = await fetchFederationsExternalMetadata(
        federations,
        (federationId, meta) => {
            dispatch(setFederationExternalMeta({ federationId, meta }))
        },
    )
    dispatch(updateExternalMeta(externalMeta))
    dispatch(setFederations(federations))
    return selectFederations(getState())
})

export const joinFederation = createAsyncThunk<
    Federation,
    { fedimint: FedimintBridge; code: string },
    { state: CommonState }
>(
    'federation/joinFederation',
    async ({ fedimint, code }, { dispatch, getState }) => {
        const federation = await fedimint.joinFederation(code)

        await dispatch(refreshFederations(fedimint))
        dispatch(setActiveFederationId(federation.id))

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
        // Fixes https://github.com/fedibtc/fedi/issues/3754
        const isRecovering = selectIsAnyFederationRecovering(getState())
        if (isRecovering) throw new Error('failed-to-leave-federation')
        await fedimint.leaveFederation(federationId)
    },
)

export const recoverFromMnemonic = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; mnemonic: SeedWords },
    { state: CommonState }
>(
    'federation/recoverFromMnemonic',
    async ({ fedimint, mnemonic }, { dispatch }) => {
        await fedimint.recoverFromMnemonic(mnemonic)
        await dispatch(refreshFederations(fedimint))
    },
)

/*** Selectors ***/

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

export const selectFederationIds = createSelector(
    selectFederations,
    federations => federations.map(f => f.id),
)

export const selectActiveFederation = createSelector(
    selectFederations,
    (s: CommonState) => s.federation.activeFederationId,
    (federations, activeFederationId): Federation | undefined =>
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

export const selectFederationClientConfig = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation ? activeFederation.clientConfig : null
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
        return activeFederation ? activeFederation.fediFeeSchedule : null
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

export const selectFederationBalance = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation ? activeFederation.balance : (0 as MSats)
    },
)

export const selectIsActiveFederationRecovering = createSelector(
    selectActiveFederation,
    activeFederation => {
        return activeFederation ? activeFederation.recovering : false
    },
)

export const selectIsAnyFederationRecovering = createSelector(
    selectFederations,
    federations => {
        return federations.some(f => f.recovering)
    },
)

export const selectFederationCustomFediMods = (s: CommonState) => {
    const activeFederation = selectActiveFederation(s)
    return activeFederation
        ? s.federation.customFediMods[activeFederation?.id] || []
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

export const selectFederationFediMods = createSelector(
    selectActiveFederation,
    selectFederationCustomFediMods,
    (federation, customFediMods) => {
        if (!federation) return []
        return [...getFederationFediMods(federation.meta), ...customFediMods]
    },
)

export const selectFederationGroupChats = createSelector(
    selectFederationMetadata,
    getFederationGroupChats,
)

/**
 * Selects all federations that support a chat server and have
 * initialized chat state with an authenticatedMember
 */
export const selectFederationsWithChatConnections = createSelector(
    (s: CommonState) => s.chat,
    selectFederations,
    (chatState, federations) => {
        return federations.reduce((result: Federation[], f) => {
            const isChatSupported = !!getFederationChatServerDomain(f.meta)
            // Can't connect to chat if federation doesn't support chat
            if (!isChatSupported) return result

            // Can't connect to chat if we don't have auth
            const federationChatState = chatState[f.id]
            if (!federationChatState) return result
            const { authenticatedMember } = federationChatState
            if (!authenticatedMember?.id) return result

            result.push(f)
            return result
        }, [])
    },
)
