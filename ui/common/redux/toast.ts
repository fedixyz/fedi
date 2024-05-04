import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit'

import { CommonState } from '.'
import { Toast, ToastArgs } from '../types/toast'

/*** Initial State ***/

const initialState = {
    toast: null as Toast | null,
}

export type ToastState = typeof initialState

/*** Slice definition ***/

export const toastSlice = createSlice({
    name: 'toast',
    initialState,
    reducers: {
        setToast(state, action: PayloadAction<Toast>) {
            state.toast = action.payload
        },
        closeToast(state, action: PayloadAction<string | undefined>) {
            if (!action.payload || state.toast?.key === action.payload) {
                state.toast = null
            }
        },
    },
})

/*** Basic actions ***/

export const { setToast, closeToast } = toastSlice.actions

/*** Selectors ***/

export const selectToast = (s: CommonState) => s.toast.toast

/*** Async thunk actions ***/

export const showToast = createAsyncThunk<
    void,
    ToastArgs,
    { state: CommonState }
>('toast/showToast', async (toastArgs, { dispatch }) => {
    const toast: Toast = {
        key: Date.now().toString(),
        status: 'info',
        ...toastArgs,
    }

    // Show toast immediately
    dispatch(setToast(toast))

    if (toast.status === 'success') {
        setTimeout(() => {
            dispatch(closeToast(toast.key))
        }, 6000)
    }
})
