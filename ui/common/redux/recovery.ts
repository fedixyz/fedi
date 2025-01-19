import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'

import { CommonState, refreshFederations } from '.'
import { SeedWords, SocialRecoveryEvent } from '../types'
import {
    RpcDeviceIndexAssignmentStatus,
    RpcFederation,
    RpcRegisteredDevice,
} from '../types/bindings'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'

const log = makeLog('common/redux/recovery')

/*** Initial State ***/

const initialState = {
    hasCheckedForSocialRecovery: false,
    socialRecoveryQr: null as string | null,
    socialRecoveryState: null as SocialRecoveryEvent | null,
    registeredDevices: [] as RpcRegisteredDevice[],
    deviceIndexRequired: false,
    shouldLockDevice: false, // TODO: persist this to localStorage?
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

        builder.addCase(recoverFromMnemonic.fulfilled, (state, action) => {
            state.registeredDevices = action.payload
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
} = recoverySlice.actions

/*** Async thunk actions ***/

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
    await dispatch(refreshFederations(fedimint))
})

export const cancelSocialRecovery = createAsyncThunk<void, FedimintBridge>(
    'recovery/cancelSocialRecovery',
    async fedimint => {
        await fedimint.cancelSocialRecovery()
    },
)

export const recoverFromMnemonic = createAsyncThunk<
    RpcRegisteredDevice[],
    { fedimint: FedimintBridge; mnemonic: SeedWords },
    { state: CommonState }
>('recovery/recoverFromMnemonic', async ({ fedimint, mnemonic }) => {
    return fedimint.recoverFromMnemonic(mnemonic)
})

export const createNewWallet = createAsyncThunk<
    RpcFederation | null,
    { fedimint: FedimintBridge },
    { state: CommonState }
>('recovery/createNewWallet', async ({ fedimint }) => {
    return fedimint.registerAsNewDevice()
})

export const transferExistingWallet = createAsyncThunk<
    RpcFederation | null,
    { fedimint: FedimintBridge; device: RpcRegisteredDevice },
    { state: CommonState }
>('recovery/transferExistingWallet', async ({ fedimint, device }) => {
    return fedimint.transferExistingDeviceRegistration(device.deviceIndex)
})

// TODO: consider removing since it is no longer used anywhere?
export const fetchDeviceIndexAssignmentStatus = createAsyncThunk<
    RpcDeviceIndexAssignmentStatus,
    FedimintBridge
>('recovery/checkDeviceAssignmentStatus', async fedimint => {
    return fedimint.deviceIndexAssignmentStatus()
})

export const fetchRegisteredDevices = createAsyncThunk<
    RpcRegisteredDevice[],
    FedimintBridge
>('recovery/fetchRegisteredDevices', async fedimint => {
    return fedimint.fetchRegisteredDevices()
})

export const approveSocialRecoveryRequest = createAsyncThunk<
    void,
    {
        fedimint: FedimintBridge
        recoveryId: string
        peerId: number
        password: string
        federationId: string
    },
    { state: CommonState }
>(
    'recovery/approveSocialRecoveryRequest',
    async ({ fedimint, recoveryId, peerId, password, federationId }) => {
        await fedimint.approveSocialRecoveryRequest(
            recoveryId,
            peerId,
            password,
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
    void,
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
        await fedimint.socialRecoveryDownloadVerificationDoc(
            recoveryId,
            federationId,
            peerId,
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

/*** Selectors ***/

export const selectHasCheckedForSocialRecovery = (s: CommonState) =>
    s.recovery.hasCheckedForSocialRecovery

export const selectSocialRecoveryQr = (s: CommonState) =>
    s.recovery.socialRecoveryQr

export const selectSocialRecoveryState = (s: CommonState) =>
    s.recovery.socialRecoveryState

export const selectRegisteredDevices = (s: CommonState) =>
    s.recovery.registeredDevices
