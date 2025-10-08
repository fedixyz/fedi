import {
    UnsubscribeListener,
    combineReducers,
    configureStore,
    createListenerMiddleware,
    isAnyOf,
} from '@reduxjs/toolkit'
import type { i18n as I18n } from 'i18next'
import debounce from 'lodash/debounce'
import type { AnyAction } from 'redux'
import type { ThunkDispatch } from 'redux-thunk'

import { Community, StorageApi } from '../types'
import { RpcFederationMaybeLoading } from '../types/bindings'
import {
    coerceCommunity,
    coerceLoadedFederation,
} from '../utils/FederationUtils'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { hasStorageStateChanged } from '../utils/storage'
import { analyticsSlice } from './analytics'
import { browserSlice } from './browser'
import { currencySlice, refreshHistoricalCurrencyRates } from './currency'
import { environmentSlice } from './environment'
import {
    federationSlice,
    joinFederation,
    processCommunityMeta,
    processFederationMeta,
    refreshFederations,
    refreshGuardianStatuses,
    tryRejoinFederationsPendingScratchRejoin,
    updateFederationBalance,
    upsertCommunity,
    upsertFederation,
} from './federation'
import {
    checkForReceivablePayments,
    handleMatrixRoomTimelineStreamUpdates,
    matrixSlice,
} from './matrix'
import { modSlice } from './mod'
import { nuxSlice } from './nux'
import { recoverySlice } from './recovery'
import { securitySlice } from './security'
import {
    loadFromStorage,
    saveToStorage,
    setReadyToSave,
    storageSlice,
} from './storage'
import { checkSurveyCondition, supportSlice } from './support'
import { toastSlice } from './toast'
import { transactionsSlice, updateTransaction } from './transactions'
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
    analytics: analyticsSlice.reducer,
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

export const rootReducer = combineReducers({ ...commonReducers })

export const setupStore = (preloadedState?: Partial<CommonState>) => {
    return configureStore({
        middleware: getDefaultMiddleware =>
            getDefaultMiddleware().prepend(listenerMiddleware.middleware),
        reducer: rootReducer,
        preloadedState,
    })
}

export type RootState = ReturnType<typeof rootReducer>

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
    store: ReturnType<typeof setupStore>
    fedimint: FedimintBridge
    storage: StorageApi
    i18n: I18n
    detectLanguage?: () => Promise<string>
}) {
    const receivedPayments = new Set<string>()

    dispatch(refreshHistoricalCurrencyRates({ fedimint }))
        .unwrap()
        .catch(() => {
            log.warn(
                'Failed to refresh historical currency rates during store initialization:',
            )
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
            switch (event.init_state) {
                // For loading and failed states we just pass it along as-is
                case 'loading':
                case 'failed':
                    dispatch(upsertFederation(event))
                    break
                // For ready states we prepare the full loaded federation with meta + status updates
                case 'ready': {
                    let loadedFederation = coerceLoadedFederation(event)
                    dispatch(upsertFederation(loadedFederation))

                    if ('meta' in loadedFederation) {
                        // if the federation_name is found in the meta, overwrite top-level name field

                        if (loadedFederation.meta.federation_name) {
                            // Make copy to avoid permission errors assigning value to read-only property
                            loadedFederation = {
                                ...loadedFederation,
                                name: loadedFederation.meta.federation_name,
                            }
                        }

                        dispatch(
                            processFederationMeta({
                                fedimint,
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
            const community: Community = coerceCommunity(event.newCommunity)
            dispatch(upsertCommunity(community))
            dispatch(processCommunityMeta({ fedimint, community }))
        },
    )

    // Automatically rejoin federations that fail the nonce reuse check and recover from scratch
    const unsubscribeNonceReuseCheckFailed = fedimint.addListener(
        'nonceReuseCheckFailed',
        () => {
            dispatch(tryRejoinFederationsPendingScratchRejoin({ fedimint }))
        },
    )

    const updateFederationBalanceDebounced = debounce(event => {
        log.debug('Debounced Balance update', event)
        dispatch(updateFederationBalance(event))
    }, 100) // 100ms delay to maintain trickle effect

    // Update balance on bridge events
    const unsubscribeBalance = fedimint.addListener('balance', event => {
        updateFederationBalanceDebounced(event)
    })

    // Add or update transactions on bridge events
    const unsubscribeTransaction = fedimint.addListener(
        'transaction',
        event => {
            log.debug('Transaction update', event)
            dispatch(updateTransaction(event))
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
        dispatch(checkSurveyCondition())
        dispatch(setReadyToSave(true))
    })

    // Listen for incoming payment events, and claim any we haven't attempted
    // to claim yet.
    //
    // TODO: Does this logic belong here in redux middleware?
    // This is only called on `roomTimelineUpdate` events, so why not
    // claim ecash in the `MatrixChatClient` (before it touches redux)?
    const checkForReceivablePaymentsDebounced = debounce(
        (apiDispatch, roomId) => {
            apiDispatch(
                checkForReceivablePayments({
                    fedimint,
                    roomId,
                    receivedPayments,
                }),
            )
        },
        300,
    )
    const unsubscribeMatrixPayments = listenerMiddleware.startListening({
        matcher: isAnyOf(
            joinFederation.fulfilled,
            handleMatrixRoomTimelineStreamUpdates,
        ),
        effect: (
            action:
                | ReturnType<typeof joinFederation.fulfilled>
                | ReturnType<typeof handleMatrixRoomTimelineStreamUpdates>,
            api,
        ) => {
            const roomId =
                'roomId' in action.payload ? action.payload?.roomId : undefined
            checkForReceivablePaymentsDebounced(api.dispatch, roomId)
        },
    })

    return () => {
        unsubscribeFederation()
        unsubscribeNonceReuseCheckFailed()
        unsubscribeCommunities()
        unsubscribeBalance()
        unsubscribeTransaction()
        unsubscribeRecovery()
        unsubscribeStorage()
        unsubscribeMatrixPayments()
    }
}
