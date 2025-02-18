import { NetInfoState } from '@react-native-community/netinfo'
import {
    createAsyncThunk,
    createSelector,
    createSlice,
    PayloadAction,
} from '@reduxjs/toolkit'
import type { i18n } from 'i18next'

import { CommonState } from '.'
import { RpcNostrPubkey, RpcNostrSecret } from '../types/bindings'
import { FedimintBridge } from '../utils/fedimint'
import { loadFromStorage } from './storage'

/*** Initial State ***/

const initialState = {
    networkInfo: null as NetInfoState | null,
    developerMode: false,
    fedimodDebugMode: false,
    onchainDepositsEnabled: false,
    stableBalanceEnabled: false,
    language: null as string | null,
    amountInputType: undefined as 'sats' | 'fiat' | undefined,
    showFiatTxnAmounts: true,
    deviceId: undefined as string | undefined,
    nostrNpub: undefined as RpcNostrPubkey | undefined,
    nostrNsec: undefined as RpcNostrSecret | undefined,
    fedimintVersion: undefined as string | undefined,
}

export type EnvironmentState = typeof initialState

/*** Slice definition ***/

export const environmentSlice = createSlice({
    name: 'environment',
    initialState,
    reducers: {
        setNetworkInfo(state, action: PayloadAction<NetInfoState>) {
            state.networkInfo = action.payload
        },
        setDeveloperMode(state, action: PayloadAction<boolean>) {
            state.developerMode = action.payload
        },
        setFediModDebugMode(state, action: PayloadAction<boolean>) {
            state.fedimodDebugMode = action.payload
        },
        setAmountInputType(
            state,
            action: PayloadAction<EnvironmentState['amountInputType']>,
        ) {
            state.amountInputType = action.payload
        },
        setOnchainDepositsEnabled(state, action: PayloadAction<boolean>) {
            state.onchainDepositsEnabled = action.payload
        },
        setStableBalanceEnabled(state, action: PayloadAction<boolean>) {
            state.stableBalanceEnabled = action.payload
        },
        setShowFiatTxnAmounts(state, action: PayloadAction<boolean>) {
            state.showFiatTxnAmounts = action.payload
        },
        setDeviceId(state, action: PayloadAction<string>) {
            state.deviceId = action.payload
        },
        setNostrNpub(state, action: PayloadAction<RpcNostrPubkey>) {
            state.nostrNpub = action.payload
        },
        setNostrNsec(state, action: PayloadAction<RpcNostrSecret>) {
            state.nostrNsec = action.payload
        },
        setFedimintVersion(state, action: PayloadAction<string>) {
            state.fedimintVersion = action.payload
        },
    },
    extraReducers: builder => {
        builder.addCase(changeLanguage.fulfilled, (state, action) => {
            state.language = action.meta.arg.language
        })

        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload) return
            state.language = action.payload.language
            if (action.payload.amountInputType) {
                state.amountInputType = action.payload.amountInputType
            }
            if (action.payload.onchainDepositsEnabled) {
                state.onchainDepositsEnabled =
                    action.payload.onchainDepositsEnabled
            }
            if (action.payload.stableBalanceEnabled) {
                state.stableBalanceEnabled = action.payload.stableBalanceEnabled
            }
            if (action.payload.developerMode) {
                state.developerMode = action.payload.developerMode
            }
            if (action.payload.showFiatTxnAmounts !== undefined) {
                state.showFiatTxnAmounts = action.payload.showFiatTxnAmounts
            }
            if (action.payload.deviceId !== undefined) {
                state.deviceId = action.payload.deviceId
            }
        })
    },
})

/*** Basic actions ***/

export const {
    setNetworkInfo,
    setDeveloperMode,
    setFediModDebugMode,
    setAmountInputType,
    setOnchainDepositsEnabled,
    setStableBalanceEnabled,
    setShowFiatTxnAmounts,
    setDeviceId,
    setNostrNpub,
    setNostrNsec,
    setFedimintVersion,
} = environmentSlice.actions

/*** Async thunk actions ***/

export const changeLanguage = createAsyncThunk<
    void,
    { language: string; i18n: i18n }
>('environment/changeLanguage', ({ language, i18n }) => {
    i18n.changeLanguage(language)
})

/**
 * Used only by the PWA.
 * Initializes the device ID with a value generated once on first app
 * load and persisted to storage as a cached value between sessions.
 *
 * The native app should not use this function and instead should generate
 * a unique device ID using RNDI and should never persist it to storage
 */
export const initializeDeviceIdWeb = createAsyncThunk<
    string,
    { deviceId: string },
    { state: CommonState }
>(
    'environment/initializeDeviceIdWeb',
    async ({ deviceId }, { getState, dispatch }) => {
        const cachedDeviceId = getState().environment.deviceId
        if (!cachedDeviceId) {
            dispatch(setDeviceId(deviceId))
        }
        return cachedDeviceId || deviceId
    },
)

export const initializeNostrKeys = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; forceRefresh?: boolean },
    { state: CommonState }
>(
    'environment/initializeNostrKeys',
    async ({ fedimint, forceRefresh }, { getState, dispatch }) => {
        if (!forceRefresh && getState().environment.nostrNpub) return
        dispatch(setNostrNpub(await fedimint.getNostrPubkey()))
        dispatch(setNostrNsec(await fedimint.getNostrSecret()))
    },
)

export const initializeFedimintVersion = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>(
    'environment/initializeFedimintVersion',
    async ({ fedimint }, { dispatch }) => {
        const version = await fedimint.fedimintVersion()

        dispatch(setFedimintVersion(version))
    },
)

/*** Selectors ***/

export const selectNetworkInfo = (s: CommonState) => s.environment.networkInfo

/*
 * This seemingly complex selector is necessary because we want certainty that
 * either there is no network connection or the internet is definitely unreachable.
 */
export const selectIsInternetUnreachable = createSelector(
    selectNetworkInfo,
    networkInfo => {
        if (!networkInfo) return false
        if (networkInfo.isConnected === false) return true
        // sometimes isInternetReachable is null which does not definitively
        // mean the internet is unreachable so explicitly check for false
        if (networkInfo.isInternetReachable === false) return true
        else return false
    },
)

export const selectDeveloperMode = (s: CommonState) =>
    s.environment.developerMode

export const selectFediModDebugMode = (s: CommonState) =>
    s.environment.fedimodDebugMode

export const selectOnchainDepositsEnabled = (s: CommonState) =>
    s.environment.onchainDepositsEnabled

export const selectLanguage = (s: CommonState) => s.environment.language

export const selectAmountInputType = (s: CommonState) =>
    s.environment.amountInputType

export const selectStableBalanceEnabled = (s: CommonState) =>
    s.environment.stableBalanceEnabled

export const selectShowFiatTxnAmounts = (s: CommonState) =>
    s.environment.showFiatTxnAmounts

export const selectDeviceId = (s: CommonState) => s.environment.deviceId

export const selectNostrNpub = (s: CommonState) => s.environment.nostrNpub

export const selectNostrNsec = (s: CommonState) => s.environment.nostrNsec

export const selectFedimintVersion = (s: CommonState) =>
    s.environment.fedimintVersion
