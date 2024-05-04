import {
    EnhancedStore,
    UnsubscribeListener,
    createListenerMiddleware,
} from '@reduxjs/toolkit'
import { CurriedGetDefaultMiddleware } from '@reduxjs/toolkit/dist/getDefaultMiddleware'
import type { i18n as I18n } from 'i18next'
import type { AnyAction } from 'redux'
import type { ThunkDispatch } from 'redux-thunk'

import { Federation, StorageApi } from '../types'
import { getMetaUrl } from '../utils/FederationUtils'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { getReceivablePaymentEvents } from '../utils/matrix'
import { hasStorageStateChanged } from '../utils/storage'
import { chatSlice } from './chat'
import { currencySlice, fetchCurrencyPrices } from './currency'
import { environmentSlice, selectLanguage } from './environment'
import {
    federationSlice,
    refreshFederations,
    updateFederation,
    updateFederationBalance,
} from './federation'
import {
    claimMatrixPayment,
    handleMatrixRoomTimelineObservableUpdates,
    matrixSlice,
} from './matrix'
import { nuxSlice } from './nux'
import { recoverySlice } from './recovery'
import { loadFromStorage, saveToStorage, storageSlice } from './storage'
import { toastSlice } from './toast'
import { addTransaction, transactionsSlice } from './transactions'
import { walletSlice } from './wallet'

const log = makeLog('common/redux/index')

export * from './chat'
export * from './currency'
export * from './environment'
export * from './federation'
export * from './matrix'
export * from './nux'
export * from './recovery'
export * from './toast'
export * from './wallet'

export const commonReducers = {
    chat: chatSlice.reducer,
    currency: currencySlice.reducer,
    environment: environmentSlice.reducer,
    federation: federationSlice.reducer,
    matrix: matrixSlice.reducer,
    nux: nuxSlice.reducer,
    recovery: recoverySlice.reducer,
    storage: storageSlice.reducer,
    toast: toastSlice.reducer,
    transactions: transactionsSlice.reducer,
    wallet: walletSlice.reducer,
}

type CommonReducers = typeof commonReducers
export type CommonState = {
    [key in keyof CommonReducers]: ReturnType<CommonReducers[key]>
}
export type CommonDispatch = ThunkDispatch<CommonState, unknown, AnyAction>

export const listenerMiddleware = createListenerMiddleware<
    CommonState,
    CommonDispatch
>()
export const commonMiddleware = (
    getDefaultMiddleware: CurriedGetDefaultMiddleware<CommonState>,
) => getDefaultMiddleware().prepend(listenerMiddleware.middleware)

/**
 * Sets up any initial redux behavior that is consistent across all platforms.
 */
export function initializeCommonStore({
    store: { dispatch, subscribe, getState },
    fedimint,
    storage,
    i18n,
    detectLanguage,
}: {
    store: EnhancedStore<
        CommonState,
        AnyAction,
        ReturnType<typeof commonMiddleware>
    >
    fedimint: FedimintBridge
    storage: StorageApi
    i18n: I18n
    detectLanguage?: () => Promise<string>
}) {
    // Fetch the latest prices immediately.
    dispatch(fetchCurrencyPrices()).catch(err => {
        log.warn('Failed initial currency price fetch', err)
    })

    // Update federation on bridge events
    const unsubscribeFederation = fedimint.addListener('federation', event => {
        // If they have an external meta configured, exclude name and meta from update
        const federation: Partial<Federation> = { ...event }
        if (getMetaUrl(event.meta)) {
            delete federation.name
            delete federation.meta
        }
        dispatch(updateFederation(federation))
    })

    // Update balance on bridge events
    const unsubscribeBalance = fedimint.addListener('balance', event => {
        log.debug('Balance update', event)
        dispatch(updateFederationBalance(event))
    })

    // Add or update transactions on bridge events
    const unsubscribeTransaction = fedimint.addListener(
        'transaction',
        event => {
            log.debug('Transaction update', event)
            dispatch(addTransaction(event))
        },
    )

    // Refresh federations on recoveryComplete event to enable UI
    const unsubscribeRecovery = fedimint.addListener(
        'recoveryComplete',
        event => {
            log.debug('Recovery complete', event)
            dispatch(refreshFederations(fedimint))
        },
    )

    // Load state from local storage, then start listener that syncs to storage
    // on changes to stored state after it's been loaded.
    let unsubscribeStorage: UnsubscribeListener = () => null
    dispatch(loadFromStorage({ storage })).then(() => {
        unsubscribeStorage = listenerMiddleware.startListening({
            predicate: (_action, currentState, previousState) => {
                return hasStorageStateChanged(currentState, previousState)
            },
            effect: async (_action, listnerApi) => {
                // Cancel any pending saves
                listnerApi.cancelActiveListeners()

                // Delay saving to allow for multiple state changes to be batched
                await listnerApi.delay(100)

                // Save state to storage
                dispatch(saveToStorage({ storage }))
            },
        })
    })

    // Listen for incoming payment events, and claim any we haven't attempted
    // to claim yet.
    const receivedPayments = new Set<string>()
    const unsubscribeMatrixPayments = listenerMiddleware.startListening({
        actionCreator: handleMatrixRoomTimelineObservableUpdates,
        effect: (action, api) => {
            const { roomId } = action.payload
            const state = api.getState()
            const myId = state.matrix.auth?.userId
            const timeline = state.matrix.roomTimelines[roomId]
            if (!myId || !timeline) return
            const receivablePayments = getReceivablePaymentEvents(
                timeline,
                myId,
            )
            receivablePayments.forEach(event => {
                if (receivedPayments.has(event.content.paymentId)) return
                receivedPayments.add(event.content.paymentId)
                log.info(
                    'Unclaimed matrix payment event, attempting to claim',
                    event,
                )
                api.dispatch(claimMatrixPayment({ fedimint, event }))
                    .unwrap()
                    .then(() => {
                        log.info('Successfully claimed matrix payment', event)
                    })
                    .catch(err => {
                        log.warn(
                            'Failed to claim matrix payment, will try again later',
                            err,
                        )
                        receivedPayments.delete(event.content.paymentId)
                    })
            })
        },
    })

    const unsubscribeInitialLang = subscribe(() => {
        const language = selectLanguage(getState())

        if (detectLanguage) {
            detectLanguage().then(detectedLanguage => {
                if (!language) i18n.changeLanguage(detectedLanguage)
                else i18n.changeLanguage(language)
            })
        } else if (language) i18n.changeLanguage(language)

        unsubscribeInitialLang()
    })

    return () => {
        unsubscribeFederation()
        unsubscribeBalance()
        unsubscribeTransaction()
        unsubscribeRecovery()
        unsubscribeStorage()
        unsubscribeMatrixPayments()
    }
}
