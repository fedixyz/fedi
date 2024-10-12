import { configureStore } from '@reduxjs/toolkit'
import { AppState as RNAppState } from 'react-native'

import {
    commonMiddleware,
    commonReducers,
    fetchCurrencyPrices,
    initializeCommonStore,
    setCurrencyLocale,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import i18n from '../localization/i18n'
import { getNumberFormatLocale } from '../utils/device-info'
import { storage } from '../utils/storage'

const log = makeLog('native/state/store')

export const store = configureStore({
    middleware: commonMiddleware,
    reducer: {
        ...commonReducers,
    },
})

export type AppStore = typeof store
export type AppState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export function initializeNativeStore() {
    // Common initialization behavior
    const unsubscribe = initializeCommonStore({
        store,
        fedimint,
        storage,
        i18n,
    })

    // Get the number format locale from the system and store it for later use.
    store.dispatch(setCurrencyLocale(getNumberFormatLocale()))

    // Whenever the app is brought back into the foreground, refresh prices.
    const changeSubscription = RNAppState.addEventListener('change', state => {
        if (state === 'active') {
            log.debug('App returned to foreground, refreshing prices...')
            store.dispatch(fetchCurrencyPrices())
        }
    })

    return () => {
        unsubscribe()
        changeSubscription.remove()
    }
}
