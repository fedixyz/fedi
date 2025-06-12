import { combineReducers, configureStore } from '@reduxjs/toolkit'

import {
    commonMiddleware,
    commonReducers,
    initializeCommonStore,
} from '@fedi/common/redux'

import { fedimint } from '../lib/bridge'
import i18n, { detectLanguage } from '../localization/i18n'
import { asyncLocalStorage } from '../utils/localstorage'

const rootReducer = combineReducers({ ...commonReducers })

export const setupStore = (preloadedState?: Partial<RootState>) => {
    return configureStore({
        middleware: commonMiddleware,
        reducer: rootReducer,
        preloadedState,
    })
}

export const store = setupStore()

export type RootState = ReturnType<typeof rootReducer>
export type AppState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export function initializeWebStore() {
    // Common initialization behavior
    return initializeCommonStore({
        store,
        fedimint,
        storage: asyncLocalStorage,
        i18n,
        detectLanguage,
    })
}

// Handle hot-reloading reducers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (process.env.NODE_ENV !== 'production' && (module as any)?.hot) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(module as any).hot.accept('@fedi/common/redux', () =>
        store.replaceReducer(rootReducer),
    )
}
