import {
    EnhancedStore,
    UnsubscribeListener,
    createListenerMiddleware,
    isAnyOf,
} from '@reduxjs/toolkit'
import { CurriedGetDefaultMiddleware } from '@reduxjs/toolkit/dist/getDefaultMiddleware'
import type { i18n as I18n } from 'i18next'
import type { AnyAction } from 'redux'
import type { ThunkDispatch } from 'redux-thunk'

import { FederationListItem, StorageApi } from '../types'
import { RpcFederationMaybeLoading } from '../types/bindings'
import {
    coerceFederationListItem,
    coerceLoadedFederation,
} from '../utils/FederationUtils'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { hasStorageStateChanged } from '../utils/storage'
import { browserSlice } from './browser'
import { currencySlice, fetchCurrencyPrices } from './currency'
import { environmentSlice } from './environment'
import {
    federationSlice,
    joinFederation,
    processFederationMeta,
    refreshFederations,
    refreshGuardianStatuses,
    updateFederationBalance,
    upsertFederation,
} from './federation'
import {
    checkForReceivablePayments,
    handleMatrixRoomTimelineObservableUpdates,
    matrixSlice,
} from './matrix'
import { modSlice } from './mod'
import { nuxSlice } from './nux'
import { recoverySlice } from './recovery'
import { securitySlice } from './security'
import { loadFromStorage, saveToStorage, storageSlice } from './storage'
import { supportSlice } from './support'
import { toastSlice } from './toast'
import { addTransaction, transactionsSlice } from './transactions'
import { walletSlice } from './wallet'

const log = makeLog('common/redux/index')

export * from './currency'
export * from './environment'
export * from './federation'
export * from './matrix'
export * from './nux'
export * from './recovery'
export * from './security'
export * from './toast'
export * from './wallet'
export * from './browser'

export const commonReducers = {
    currency: currencySlice.reducer,
    environment: environmentSlice.reducer,
    federation: federationSlice.reducer,
    matrix: matrixSlice.reducer,
    mod: modSlice.reducer,
    nux: nuxSlice.reducer,
    recovery: recoverySlice.reducer,
    storage: storageSlice.reducer,
    toast: toastSlice.reducer,
    transactions: transactionsSlice.reducer,
    wallet: walletSlice.reducer,
    security: securitySlice.reducer,
    browser: browserSlice.reducer,
    support: supportSlice.reducer,
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
    store: { dispatch },
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
    const receivedPayments = new Set<string>()

    // Fetch the latest prices immediately.
    dispatch(fetchCurrencyPrices()).catch(err => {
        log.warn('Failed initial currency price fetch', err)
    })

    // Update federation on bridge events
    const unsubscribeFederation = fedimint.addListener(
        'federation',
        async (event: RpcFederationMaybeLoading) => {
            // don't both updating if the federation isn't ready
            // TODO: Should we remove failed federations from the UI?
            // if (event.init_state !== 'ready') return
            // just in case an erroneous event fires with no id
            if (!event.id) return
            let federation: FederationListItem
            switch (event.init_state) {
                // For loading and failes states we just pass it along as-is with hasWallet
                case 'loading':
                case 'failed':
                    federation = {
                        ...event,
                        hasWallet: true,
                    }
                    dispatch(upsertFederation(federation))
                    break
                // For ready states we prepare the full loaded federation with meta + status updates
                case 'ready': {
                    const loadedFederation = coerceLoadedFederation(event)
                    dispatch(upsertFederation(loadedFederation))
                    if ('meta' in loadedFederation) {
                        // if the federation_name is found in the meta, overwrite top-level name field
                        if (loadedFederation.meta.federation_name) {
                            loadedFederation.name =
                                loadedFederation.meta.federation_name
                        }
                        dispatch(
                            processFederationMeta({
                                federation: loadedFederation,
                            }),
                        )
                    }

                    // also refresh the guardian status when we get a federation update
                    dispatch(
                        refreshGuardianStatuses({
                            fedimint,
                            federation: loadedFederation,
                        }),
                    )
                    break
                }
            }
        },
    )

    // Update communities on bridge events
    const unsubscribeCommunities = fedimint.addListener(
        'communityMetadataUpdated',
        event => {
            const federation: FederationListItem = coerceFederationListItem(
                event.newCommunity,
            )
            dispatch(upsertFederation(federation))
            dispatch(processFederationMeta({ federation }))
        },
    )

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
        async event => {
            log.debug('Recovery complete', event)
            await dispatch(refreshFederations(fedimint))
            // we check for receivable chat payments from this newly
            // joined federation after recovery is complete
            dispatch(checkForReceivablePayments({ fedimint, receivedPayments }))
        },
    )

    // Load state from local storage, then start listener that syncs to storage
    // on changes to stored state after it's been loaded.
    let unsubscribeStorage: UnsubscribeListener = () => null
    dispatch(
        // Detects and sets the language (if applicable) or loads the selected one from stored state
        loadFromStorage({
            storage,
            i18n,
            detectLanguage,
        }),
    ).then(() => {
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
    //
    // TODO: Does this logic belong here in redux middleware?
    // This is only called on `roomTimelineUpdate` events, so why not
    // claim ecash in the `MatrixChatClient` (before it touches redux)?
    const unsubscribeMatrixPayments = listenerMiddleware.startListening({
        matcher: isAnyOf(
            joinFederation.fulfilled,
            handleMatrixRoomTimelineObservableUpdates,
        ),
        effect: (action, api) => {
            const { roomId } = action.payload
            api.dispatch(
                checkForReceivablePayments({
                    fedimint,
                    roomId,
                    receivedPayments,
                }),
            )
        },
    })

    return () => {
        unsubscribeFederation()
        unsubscribeCommunities()
        unsubscribeBalance()
        unsubscribeTransaction()
        unsubscribeRecovery()
        unsubscribeStorage()
        unsubscribeMatrixPayments()
    }
}
