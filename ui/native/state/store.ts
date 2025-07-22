import NetInfo from '@react-native-community/netinfo'
import { configureStore, ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import debounce from 'lodash/debounce'
import { AppState as RNAppState } from 'react-native'

import {
    commonMiddleware,
    commonReducers,
    CommonState,
    initializeCommonStore,
    setCurrencyLocale,
    refreshHistoricalCurrencyRates,
    setIsInternetUnreachable,
} from '@fedi/common/redux'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import i18n from '../localization/i18n'
import { getNumberFormatLocale } from '../utils/device-info'
import { checkIsInternetUnreachable } from '../utils/environment'
import { storage } from '../utils/storage'

const log = makeLog('native/state/store')

export const store = configureStore({
    // @ts-expect-error - TODO: investigate how to type this properly
    middleware: commonMiddleware,
    reducer: {
        ...commonReducers,
    },
})

export type AppStore = typeof store
export type AppState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch &
    ThunkDispatch<CommonState, unknown, UnknownAction>

export function initializeNativeStore() {
    // Common initialization behavior
    const unsubscribe = initializeCommonStore({
        // @ts-expect-error - TODO: investigate how to type this properly
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
            const appDispatch = store.dispatch as AppDispatch

            appDispatch(refreshHistoricalCurrencyRates({ fedimint }))
                .unwrap()
                .catch((err: unknown) => {
                    const message =
                        err instanceof Error ? err.message : String(err)
                    log.warn(
                        'Failed to refresh currency rates on app foreground:',
                        message,
                    )
                })
        }
    })

    // Whenever the app changes its network state, update the store
    const networkSubscription = NetInfo.addEventListener(
        debounce(
            state => {
                log.debug('Network status changed (debounced)', state)
                const isInternetUnreachable = checkIsInternetUnreachable(state)
                store.dispatch(setIsInternetUnreachable(isInternetUnreachable))
            },
            100,
            { leading: true, trailing: true },
        ),
    )

    return () => {
        unsubscribe()
        changeSubscription.remove()
        networkSubscription()
    }
}
