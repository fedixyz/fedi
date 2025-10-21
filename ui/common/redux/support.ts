import { createSlice, PayloadAction, Dispatch } from '@reduxjs/toolkit'

import { CommonState } from '.'
import { loadFromStorage } from './storage'

/*** Initial State ***/

const initialState = {
    supportPermissionGranted: false,
    zendeskPushNotificationToken: null as string | null,
    zendeskInitialized: false,
    zendeskUnreadMessageCount: 0,
}

export type SupportState = typeof initialState

/*** Slice definition ***/

export const supportSlice = createSlice({
    name: 'support',
    initialState,
    reducers: {
        setSupportPermission(state, action: PayloadAction<boolean>) {
            state.supportPermissionGranted = action.payload
        },
        setZendeskPushNotificationToken(state, action: PayloadAction<string>) {
            state.zendeskPushNotificationToken = action.payload
        },
        setZendeskInitialized(state, action: PayloadAction<boolean>) {
            state.zendeskInitialized = action.payload
        },
        setZendeskUnreadMessageCount(state, action: PayloadAction<number>) {
            state.zendeskUnreadMessageCount = action.payload
        },
    },
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, (state, action) => {
            if (!action.payload?.support) return
            const { supportPermissionGranted, zendeskPushNotificationToken } =
                action.payload.support

            state.supportPermissionGranted =
                supportPermissionGranted ?? state.supportPermissionGranted
            state.zendeskPushNotificationToken =
                zendeskPushNotificationToken ??
                state.zendeskPushNotificationToken
        })
    },
})

/*** Basic actions ***/

export const {
    setSupportPermission,
    setZendeskPushNotificationToken,
    setZendeskInitialized,
    setZendeskUnreadMessageCount,
} = supportSlice.actions

/*** Selectors ***/

export const selectSupportPermissionGranted = (s: CommonState) =>
    s.support.supportPermissionGranted

export const selectZendeskPushNotificationToken = (s: CommonState) =>
    s.support.zendeskPushNotificationToken

export const selectZendeskInitialized = (s: CommonState) =>
    s.support.zendeskInitialized

export const selectZendeskUnreadMessageCount = (s: CommonState) =>
    s.support.zendeskUnreadMessageCount

/*** Synchronous wrapper actions ***/

export const grantSupportPermission = () => (dispatch: Dispatch) => {
    dispatch(setSupportPermission(true))
}

export const saveZendeskPushNotificationToken =
    (token: string) => (dispatch: Dispatch) => {
        dispatch(setZendeskPushNotificationToken(token))
    }

export const updateZendeskUnreadMessageCount =
    (count: number) => (dispatch: Dispatch) => {
        dispatch(setZendeskUnreadMessageCount(count))
    }
