import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'

import { CommonState, refreshOnboardingStatus } from '.'
import { SeedWords, SocialRecoveryEvent } from '../types'
import { RpcFederation, RpcRegisteredDevice } from '../types/bindings'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { changeAuthenticatedGuardian } from './federation'

const log = makeLog('common/redux/recovery')

/*** Initial State ***/

const initialState = {
    hasCheckedForSocialRecovery: false,
    socialRecoveryQr: null as string | null,
    socialRecoveryState: null as SocialRecoveryEvent | null,
    registeredDevices: [] as RpcRegisteredDevice[],
    deviceIndexRequired: false,
    shouldLockDevice: false, // TODO: persist this to localStorage?
    shouldMigrateSeed: false, // TODO: persist this to localStorage?
}

export type RecoveryState = typeof initialState

/*** Slice definition ***/

export const recoverySlice = createSlice({
    name: 'recovery',
    initialState,
    reducers: {
        setSocialRecoveryState(
            state,
            action: PayloadAction<RecoveryState['socialRecoveryState']>,
        ) {
            state.socialRecoveryState = action.payload
        },
        setDeviceIndexRequired(state, action: PayloadAction<boolean>) {
            state.deviceIndexRequired = action.payload
        },
        setShouldLockDevice(state, action: PayloadAction<boolean>) {
            state.shouldLockDevice = action.payload
        },
        setShouldMigrateSeed(state, action: PayloadAction<boolean>) {
            state.shouldMigrateSeed = action.payload
        },
    },
    extraReducers: builder => {
        builder.addCase(fetchSocialRecovery.fulfilled, (state, action) => {
            state.hasCheckedForSocialRecovery = true
            if (action.payload) {
                state.socialRecoveryQr = action.payload.qr
                state.socialRecoveryState = action.payload.state
            } else {
                state.socialRecoveryQr = null
                state.socialRecoveryState = null
            }
        })

        builder.addCase(
            refreshSocialRecoveryState.fulfilled,
            (state, action) => {
                state.socialRecoveryState = action.payload
            },
        )

        builder.addCase(completeSocialRecovery.fulfilled, state => {
            state.socialRecoveryQr = null
            state.socialRecoveryState = null
        })

        builder.addCase(cancelSocialRecovery.fulfilled, state => {
            state.socialRecoveryQr = null
            state.socialRecoveryState = null
        })

        builder.addCase(restoreMnemonic.fulfilled, state => {
            // TODO: remove this for privacy reasons after we know seed reuse is stable... will be useful for debugging any problems
            log.debug(
                'recoverFromMnemonic registeredDevices',
                state.registeredDevices,
            )
        })

        builder.addCase(fetchRegisteredDevices.fulfilled, (state, action) => {
            state.registeredDevices = action.payload
            // TODO: remove this for privacy reasons after we know seed reuse is stable... will be useful for debugging any problems
            log.debug(
                'fetchRegisteredDevices registeredDevices',
                state.registeredDevices,
            )
        })
    },
})

/*** Basic actions ***/

export const {
    setSocialRecoveryState,
    setDeviceIndexRequired,
    setShouldLockDevice,
    setShouldMigrateSeed,
} = recoverySlice.actions

/*** Async thunk actions ***/

export const initializeDeviceRegistration = createAsyncThunk<
    void,
    FedimintBridge,
    { state: CommonState }
>('recovery/initializeDeviceRegistration', async (fedimint, { dispatch }) => {
    dispatch(setDeviceIndexRequired(true))

    // TODO: make sure this is offline-friendly? should it be?
    await dispatch(fetchRegisteredDevices(fedimint)).unwrap()
})

export const fetchSocialRecovery = createAsyncThunk<
    { qr: string; state: SocialRecoveryEvent } | void,
    FedimintBridge
>('recovery/fetchSocialRecovery', async fedimint => {
    const qr = await fedimint.recoveryQr()
    if (!qr) return
    const state = await fedimint.socialRecoveryApprovals()
    return { qr: JSON.stringify(qr), state }
})

export const refreshSocialRecoveryState = createAsyncThunk<
    SocialRecoveryEvent,
    FedimintBridge
>('recovery/fetchSocialRecoveryState', async fedimint => {
    return fedimint.socialRecoveryApprovals()
})

export const completeSocialRecovery = createAsyncThunk<
    void,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('recovery/completeSocialRecovery', async ({ fedimint }, { dispatch }) => {
    await fedimint.completeSocialRecovery()
    await dispatch(refreshOnboardingStatus(fedimint))
})

export const cancelSocialRecovery = createAsyncThunk<void, FedimintBridge>(
    'recovery/cancelSocialRecovery',
    async fedimint => {
        await fedimint.cancelSocialRecovery()
    },
)

export const restoreMnemonic = createAsyncThunk<
    null,
    { fedimint: FedimintBridge; mnemonic: SeedWords },
    { state: CommonState }
>('recovery/restoreMnemonic', async ({ fedimint, mnemonic }) => {
    return fedimint.restoreMnemonic(mnemonic)
})

// Adds a new device for an existing user.
// Leaving the old device in-tact/working
// Currently DISABLED in the UI.
export const createNewWallet = createAsyncThunk<
    RpcFederation | null,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('recovery/createNewWallet', async ({ fedimint }) => {
    return fedimint.onboardRegisterAsNewDevice()
})

// Transfers a wallet from one device to another.
// This bricks the old device.
export const transferExistingWallet = createAsyncThunk<
    RpcFederation | null,
    { fedimint: FedimintBridge; device: RpcRegisteredDevice },
    { state: CommonState }
>('recovery/transferExistingWallet', async ({ fedimint, device }) => {
    return fedimint.onboardTransferExistingDeviceRegistration(
        device.deviceIndex,
    )
})

export const fetchRegisteredDevices = createAsyncThunk<
    RpcRegisteredDevice[],
    FedimintBridge
>('recovery/fetchRegisteredDevices', async fedimint => {
    return fedimint.fetchRegisteredDevices()
})

export const approveSocialRecoveryRequest = createAsyncThunk<
    null,
    {
        fedimint: FedimintBridge
        recoveryId: string
        peerId: number
        federationId: string
    },
    { state: CommonState }
>(
    'recovery/approveSocialRecoveryRequest',
    async ({ fedimint, recoveryId, peerId, federationId }) => {
        const guardianPassword = await fedimint.getGuardianPassword(
            federationId,
            peerId,
        )

        return fedimint.approveSocialRecoveryRequest(
            recoveryId,
            peerId,
            guardianPassword,
            federationId,
        )
    },
)

export const locateRecoveryFile = createAsyncThunk<string, FedimintBridge>(
    'recovery/locateRecoveryFile',
    async fedimint => {
        return fedimint.locateRecoveryFile()
    },
)

export const socialRecoveryDownloadVerificationDoc = createAsyncThunk<
    string | null,
    {
        fedimint: FedimintBridge
        recoveryId: string
        peerId: number
        federationId: string
    },
    { state: CommonState }
>(
    'recovery/socialRecoveryDownloadVerificationDoc',
    async ({ fedimint, recoveryId, federationId, peerId }) => {
        const guardianPassword = await fedimint.getGuardianPassword(
            federationId,
            peerId,
        )

        return fedimint.socialRecoveryDownloadVerificationDoc(
            recoveryId,
            federationId,
            peerId,
            guardianPassword,
        )
    },
)

export const uploadBackupFile = createAsyncThunk<
    void,
    { fedimint: FedimintBridge; federationId: string; videoFilePath: string },
    { state: CommonState }
>(
    'recovery/uploadBackupFile',
    async ({ fedimint, federationId, videoFilePath }) => {
        await fedimint.uploadBackupFile(videoFilePath, federationId)
    },
)

export const setGuardianPassword = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federationId: string
        peerId: number
        password: string
    }
>(
    'recovery/setGuardianPassword',
    async ({ fedimint, federationId, peerId, password }) => {
        await fedimint.setGuardianPassword(federationId, peerId, password)
    },
)

export const getGuardianPassword = createAsyncThunk<
    string,
    { fedimint: FedimintBridge; federationId: string; peerId: number }
>(
    'recovery/getGuardianPassword',
    async ({ fedimint, federationId, peerId }) => {
        return fedimint.getGuardianPassword(federationId, peerId)
    },
)

export const setGuardianAssist = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        federationId: string
        peerId: number
        name: string
        url: string
        password: string
    }
>(
    'recovery/setGuardianAssist',
    async (
        { fedimint, federationId, peerId, name, url, password },
        { dispatch },
    ) => {
        await fedimint.setGuardianPassword(federationId, peerId, password)

        dispatch(
            changeAuthenticatedGuardian({
                peerId,
                name,
                url,
                federationId,
            }),
        )
    },
)

/*** Selectors ***/

export const selectHasCheckedForSocialRecovery = (s: CommonState) =>
    s.recovery.hasCheckedForSocialRecovery

export const selectSocialRecoveryQr = (s: CommonState) =>
    s.recovery.socialRecoveryQr

export const selectSocialRecoveryState = (s: CommonState) =>
    s.recovery.socialRecoveryState

export const selectRegisteredDevices = (s: CommonState) =>
    s.recovery.registeredDevices
