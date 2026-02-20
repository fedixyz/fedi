import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { i18n } from 'i18next'

import {
    checkJoinedFederationsForAutojoinCommunities,
    checkSurveyCondition,
    CommonState,
    fetchSocialRecovery,
    initializeDeviceRegistration,
    refreshCommunities,
    refreshFederations,
    setShouldLockDevice,
    setShouldMigrateSeed,
    setSurveyTimestamp,
    startMatrixClient,
} from '.'
import {
    FeatureCatalog,
    RpcNostrPubkey,
    RpcNostrSecret,
    OnboardingMethod,
    RpcAppFlavor,
} from '../types/bindings'
import { FediModCacheMode } from '../types/fediInternal'
import { HomeNavigationTab } from '../types/linking'
import { I18nLanguage } from '../types/localization'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { loadFromStorage } from './storage'

const log = makeLog('redux/environment')

/*** Initial State ***/

const initialState = {
    isInternetUnreachable: false,
    developerMode: false,
    fedimodDebugMode: false,
    fedimodCacheEnabled: true,
    fedimodShowClearCacheButton: false,
    fedimodCacheMode: 'LOAD_DEFAULT' as FediModCacheMode,
    onchainDepositsEnabled: false,
    stableBalanceEnabled: false,
    language: null as string | null,
    amountInputType: undefined as 'sats' | 'fiat' | undefined,
    transactionDisplayType: 'fiat' as 'fiat' | 'sats',
    deviceId: undefined as string | undefined,
    nostrNpub: undefined as RpcNostrPubkey | undefined,
    nostrNsec: undefined as RpcNostrSecret | undefined,
    fedimintVersion: undefined as string | undefined,
    pwaVersion: undefined as string | undefined,
    featureFlags: undefined as FeatureCatalog | undefined,
    internetUnreachableBadgeShown: false,
    onboardingCompleted: false,
    onboardingMethod: null as OnboardingMethod | null,
    appFlavor: undefined as RpcAppFlavor['type'] | undefined,
    sessionCount: 0,
    redirectTo: null as string | null,
    eventListenersReady: false,
    lastUsedTab: HomeNavigationTab.Home,
}

export type EnvironmentState = typeof initialState

/*** Slice definition ***/

export const environmentSlice = createSlice({
    name: 'environment',
    initialState,
    reducers: {
        setIsInternetUnreachable(state, action: PayloadAction<boolean>) {
            state.isInternetUnreachable = action.payload
        },
        setDeveloperMode(state, action: PayloadAction<boolean>) {
            state.developerMode = action.payload
        },
        setFediModDebugMode(state, action: PayloadAction<boolean>) {
            state.fedimodDebugMode = action.payload
        },
        setFediModCacheEnabled(state, action: PayloadAction<boolean>) {
            state.fedimodCacheEnabled = action.payload
        },
        setFediModShowClearCacheButton(state, action: PayloadAction<boolean>) {
            state.fedimodShowClearCacheButton = action.payload
        },
        setFediModCacheMode(state, action: PayloadAction<FediModCacheMode>) {
            state.fedimodCacheMode = action.payload
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
        setPwaVersion(state, action: PayloadAction<string>) {
            state.pwaVersion = action.payload
        },
        setFeatureFlags(state, action: PayloadAction<FeatureCatalog>) {
            state.featureFlags = action.payload
        },
        setInternetUnreachableBadgeVisibility(
            state,
            action: PayloadAction<boolean>,
        ) {
            state.internetUnreachableBadgeShown = action.payload
            if (action.payload) {
                state.internetUnreachableBadgeShown = true
            }
        },
        setOnboardingCompleted(state, action: PayloadAction<boolean>) {
            state.onboardingCompleted = action.payload
        },
        setOnboardingMethod(
            state,
            action: PayloadAction<OnboardingMethod | null>,
        ) {
            state.onboardingMethod = action.payload
        },
        setAppFlavor(state, action: PayloadAction<RpcAppFlavor['type']>) {
            state.appFlavor = action.payload
        },
        clearSessionCount(state) {
            state.sessionCount = 0
        },
        setRedirectTo(state, actions: PayloadAction<string>) {
            state.redirectTo = actions.payload
        },
        setTransactionDisplayType(
            state,
            action: PayloadAction<'sats' | 'fiat'>,
        ) {
            state.transactionDisplayType = action.payload
        },
        setEventListenersReady(state, action: PayloadAction<boolean>) {
            state.eventListenersReady = action.payload
        },
        setLastUsedTab(state, action: PayloadAction<HomeNavigationTab>) {
            state.lastUsedTab = action.payload
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
            if (action.payload.transactionDisplayType) {
                state.transactionDisplayType =
                    action.payload.transactionDisplayType
            }
            if (action.payload.deviceId !== undefined) {
                state.deviceId = action.payload.deviceId
            }
            if (action.payload.sessionCount !== undefined) {
                state.sessionCount = action.payload.sessionCount + 1
            }
            if (action.payload.lastUsedTab !== undefined) {
                state.lastUsedTab = action.payload.lastUsedTab
            }
        })
    },
})

/*** Basic actions ***/

export const {
    clearSessionCount,
    setIsInternetUnreachable,
    setDeveloperMode,
    setFediModDebugMode,
    setFediModCacheEnabled,
    setFediModShowClearCacheButton,
    setFediModCacheMode,
    setAmountInputType,
    setOnchainDepositsEnabled,
    setStableBalanceEnabled,
    setTransactionDisplayType,
    setDeviceId,
    setNostrNpub,
    setNostrNsec,
    setFedimintVersion,
    setPwaVersion,
    setFeatureFlags,
    setInternetUnreachableBadgeVisibility,
    setOnboardingCompleted,
    setOnboardingMethod,
    setAppFlavor,
    setRedirectTo,
    setEventListenersReady,
    setLastUsedTab,
} = environmentSlice.actions

/*** Async thunk actions ***/
export const refreshOnboardingStatus = createAsyncThunk<
    void,
    FedimintBridge,
    { state: CommonState }
>('environment/refreshOnboardingStatus', async (fedimint, { dispatch }) => {
    const status = await fedimint.bridgeStatus()
    log.info('bridgeStatus', status)

    // Extract and store the onboarding method if user is onboarded
    if (status.type === 'onboarded') {
        // note: starting the matrix client does not block onboarding
        dispatch(startMatrixClient({ fedimint }))
        // we need to await the feature flags before refreshing communities
        await dispatch(getBridgeInfo(fedimint))

        await Promise.all([
            dispatch(refreshFederations(fedimint)).unwrap(),
            dispatch(refreshCommunities(fedimint)).unwrap(),
        ])

        // checks already joined federations for any communities to be autojoined
        // autojoined communities will NOT be set as selected if processed from here
        dispatch(checkJoinedFederationsForAutojoinCommunities({ fedimint }))

        // extract and store the onboarding method if user is onboarded
        dispatch(setOnboardingMethod(status.onboarding_method))
        // navigate to home
        dispatch(setOnboardingCompleted(true))
        // check the survey condition only when onboarding is complete
        dispatch(checkSurveyCondition())
    } else if (status.type === 'onboarding') {
        // Delay the survey form by one week for a newly-onboarded user
        dispatch(setSurveyTimestamp(Date.now()))
        switch (status.stage.type) {
            case 'deviceIndexSelection': // Transfer device flow
                await dispatch(initializeDeviceRegistration(fedimint))
                // navigate to RecoveryWalletOptions (/onboarding/recover/wallet-transfer)
                break
            case 'socialRecovery':
                dispatch(fetchSocialRecovery(fedimint))
                // navigate to CompleteSocialRecovery (/onboarding/recover/social)
                break
            case 'init':
                // navigate to splash
                dispatch(setOnboardingCompleted(false))
                break
            default:
                throw new Error('Unknown onboarding stage')
        }
    } else if (status.type === 'offboarding') {
        const { reason } = status
        switch (reason.type) {
            // This means the user has migrated their seed to a new device via device/app
            // cloning so we need to prompt them to reinstall and do a device transfer
            // so exit early without proceeding with further initialization
            case 'deviceIdentifierMismatch':
                dispatch(setShouldMigrateSeed(true))
                break
            case 'internalBridgeExport':
                // Bridge is ready for export, show migration screen
                dispatch(setShouldMigrateSeed(true))
                break
            case 'deviceIndexConflict':
                dispatch(setShouldLockDevice(true))
                break
            default:
        }
    } else {
        throw new Error('Unknown bridge status type')
    }
})

export const getBridgeInfo = createAsyncThunk<
    void,
    FedimintBridge,
    { state: CommonState }
>('environment/getBridgeInfo', async (fedimint, { dispatch }) => {
    await Promise.all([
        dispatch(initializeFeatureFlags({ fedimint })),
        dispatch(initializeFedimintVersion({ fedimint })),
        dispatch(initializeNostrKeys({ fedimint })),
    ])
})

export const changeLanguage = createAsyncThunk<
    void,
    { language: string; i18n: i18n }
>('environment/changeLanguage', ({ language, i18n }) => {
    i18n.changeLanguage(language)
})

/**
 * PWA uses a similar but separate versioning system to the native app.
 */
export const initializePwaVersion = createAsyncThunk<void, { version: string }>(
    'environment/initializePwaVersion',
    async ({ version }, { dispatch }) => {
        dispatch(setPwaVersion(version))
    },
)

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
            log.debug(`no cachedDeviceId found, setting to ${deviceId}`)
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

export const initializeFeatureFlags = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('environment/initializeFeatureFlags', async ({ fedimint }, { dispatch }) => {
    const features = await fedimint.getFeatureCatalog()

    dispatch(setFeatureFlags(features))
})

/*** Selectors ***/

export const selectIsInternetUnreachable = (s: CommonState) =>
    s.environment.isInternetUnreachable

export const selectDeveloperMode = (s: CommonState) =>
    s.environment.developerMode

export const selectFediModDebugMode = (s: CommonState) =>
    s.environment.fedimodDebugMode
export const selectFediModCacheEnabled = (s: CommonState) =>
    s.environment.fedimodCacheEnabled
export const selectFediModShowClearCacheButton = (s: CommonState) =>
    s.environment.fedimodShowClearCacheButton

export const selectFediModCacheMode = (s: CommonState) =>
    s.environment.fedimodCacheMode

export const selectOnchainDepositsEnabled = (s: CommonState) =>
    s.environment.onchainDepositsEnabled

export const selectLanguage = (s: CommonState) =>
    s.environment.language as I18nLanguage

export const selectAmountInputType = (s: CommonState) =>
    s.environment.amountInputType

export const selectStableBalanceEnabled = (s: CommonState) =>
    s.environment.stableBalanceEnabled

export const selectTransactionDisplayType = (s: CommonState) =>
    s.environment.transactionDisplayType

export const selectDeviceId = (s: CommonState) => s.environment.deviceId

export const selectNostrNpub = (s: CommonState) => s.environment.nostrNpub

export const selectNostrNsec = (s: CommonState) => s.environment.nostrNsec

export const selectFedimintVersion = (s: CommonState) =>
    s.environment.fedimintVersion

export const selectPwaVersion = (s: CommonState) => s.environment.pwaVersion

export const selectFeatureFlags = (s: CommonState) => s.environment.featureFlags

export const selectFeatureFlag = <T extends keyof FeatureCatalog>(
    s: CommonState,
    featureFlag: T,
) => s.environment.featureFlags?.[featureFlag]

export const selectIsNostrClientEnabled = ({
    environment: { featureFlags },
}: CommonState) => {
    return Boolean(
        featureFlags && Array.isArray(featureFlags.nostr_client?.relays),
    )
}

export const shouldShowRearrangeMiniapps = ({
    environment: { featureFlags },
}: CommonState) => {
    return Boolean(featureFlags?.rearrange_miniapps)
}

export const selectInternetUnreachableBadgeShown = (s: CommonState) =>
    s.environment.internetUnreachableBadgeShown

export const selectOnboardingCompleted = (s: CommonState) =>
    s.environment.onboardingCompleted

export const selectOnboardingMethod = (s: CommonState) =>
    s.environment.onboardingMethod

export const selectAppFlavor = (s: CommonState) => s.environment.appFlavor

export const selectRedirectTo = (s: CommonState) => s.environment.redirectTo

export const selectEventListenersReady = (s: CommonState) =>
    s.environment.eventListenersReady

export const selectLastUsedTab = (s: CommonState) => s.environment.lastUsedTab
