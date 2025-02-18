import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { i18n as I18n } from 'i18next'

import { CommonState } from '.'
import type { LatestStoredState, StorageApi } from '../types'
import {
    STATE_STORAGE_KEY,
    getStoredState,
    transformStateToStorage,
} from '../utils/storage'

/*** Initial State ***/

const initialState = {
    hasLoaded: false,
    lastSavedAt: 0,
}

export type EnvironmentState = typeof initialState

/*** Slice definition ***/

export const storageSlice = createSlice({
    name: 'storage',
    initialState,
    reducers: {},
    extraReducers: builder => {
        builder.addCase(loadFromStorage.fulfilled, state => {
            state.hasLoaded = true
        })
        builder.addCase(saveToStorage.fulfilled, state => {
            state.lastSavedAt = Date.now()
        })
    },
})

/*** Basic actions ***/

// export const {} = storageSlice.actions

/*** Async thunk actions ***/

export const loadFromStorage = createAsyncThunk<
    LatestStoredState | null,
    {
        storage: StorageApi
        i18n: I18n
        detectLanguage?: () => Promise<string>
    }
>('storage/loadFromStorage', async ({ storage, i18n, detectLanguage }) => {
    const storedState = await getStoredState(storage)

    // Load and initialize the language from stored state
    const language = storedState?.language
    if (detectLanguage) {
        detectLanguage().then(detectedLanguage => {
            if (!language) i18n.changeLanguage(detectedLanguage)
            else i18n.changeLanguage(language)
        })
    } else if (language) i18n.changeLanguage(language)

    return storedState
})

export const saveToStorage = createAsyncThunk<
    void,
    { storage: StorageApi },
    { state: CommonState }
>('storage/saveToStorage', async ({ storage }, { getState }) => {
    const state = getState()
    await storage.setItem(
        STATE_STORAGE_KEY,
        JSON.stringify(transformStateToStorage(state)),
    )
})

/*** Selectors ***/

export const selectHasLoadedFromStorage = (s: CommonState) =>
    s.storage.hasLoaded
