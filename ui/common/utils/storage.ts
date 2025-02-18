import get from 'lodash/get'
import omit from 'lodash/omit'

import { CommonState } from '../redux'
import { ModVisibility } from '../redux/mod'
import { Chat } from '../types'
import {
    AnyStoredState,
    LatestStoredState,
    StorageApi,
    StoredStateV10,
    StoredStateV14,
    StoredStateV2,
    StoredStateV3,
    StoredStateV4,
} from '../types/storage'
import {
    getLatestMessage,
    getLatestMessageIdsForChats,
    getLatestPaymentUpdate,
    getLatestPaymentUpdateIdsForChats,
} from './chat'

export const STATE_STORAGE_KEY = 'fedi:state'
/**
 * Given the current Redux state, transform it into the latest storage state.
 */
export function transformStateToStorage(state: CommonState): LatestStoredState {
    const transformedState: LatestStoredState = {
        version: 23,
        onchainDepositsEnabled: state.environment.onchainDepositsEnabled,
        developerMode: state.environment.developerMode,
        stableBalanceEnabled: state.environment.stableBalanceEnabled,
        language: state.environment.language,
        amountInputType: state.environment.amountInputType,
        showFiatTxnAmounts: state.environment.showFiatTxnAmounts,
        deviceId: state.environment.deviceId,
        currency: state.currency.overrideCurrency,
        btcUsdRate: state.currency.btcUsdRate,
        fiatUsdRates: state.currency.fiatUsdRates,
        customFederationCurrencies: state.currency.customFederationCurrencies,
        activeFederationId: state.federation.activeFederationId,
        authenticatedGuardian: state.federation.authenticatedGuardian,
        externalMeta: state.federation.externalMeta,
        customFediMods: state.federation.customFediMods,
        nuxSteps: state.nux.steps,
        matrixAuth: state.matrix.auth,
        protectedFeatures: state.security.protectedFeatures,
        customGlobalMods: state.mod.customGlobalMods,
        modVisibility: state.mod.modVisibility,
        support: {
            supportPermissionGranted: state.support.supportPermissionGranted,
            zendeskPushNotificationToken:
                state.support.zendeskPushNotificationToken,
        },
    }

    return transformedState
}

/**
 * Retrieve state from storage. Automatically runs migrations on it to ensure
 * it matches the LatestStoredState interface.
 */
export async function getStoredState(
    storage: StorageApi,
): Promise<LatestStoredState | null> {
    const serializedState = await storage.getItem(STATE_STORAGE_KEY)
    if (!serializedState) return null
    const storedState = JSON.parse(serializedState)
    return migrateStoredState(storedState, storage)
}

/**
 * Given the previous version of state and the next version of state, return whether
 * or not there have been any changes that should be persisted.
 */
export function hasStorageStateChanged(
    oldState: CommonState,
    newState: CommonState,
) {
    // This is kind of a pain to keep up to date with transformStateToStorage, but
    // manually doing this and checking by reference is a TON faster than generating
    // two storage objects and deeply comparing them, so it's worth the effort to keep
    // up to date since this will be called on _every_ state change.
    const keysetsToCheck = [
        ['environment', 'language'],
        ['environment', 'amountInputType'],
        ['environment', 'onchainDepositsEnabled'],
        ['environment', 'developerMode'],
        ['environment', 'stableBalanceEnabled'],
        ['environment', 'showFiatTxnAmounts'],
        ['environment', 'deviceId'],
        ['currency', 'selectedFiatCurrency'],
        ['currency', 'prices'],
        ['federation', 'activeFederationId'],
        ['federation', 'authenticatedGuardian'],
        ['federation', 'externalMeta'],
        // TODO: migrate legacy mods to customGlobalMods
        ['federation', 'customFediMods'],
        ['matrix', 'auth'],
        ['nux', 'steps'],
        ['security', 'protectedFeatures'],
        ['mod', 'customGlobalMods'],
        ['mod', 'modVisibility'],
        ['support', 'supportPermissionGranted'],
        ['support', 'zendeskPushNotificationToken'],
    ]

    for (const keysToCheck of keysetsToCheck) {
        if (get(oldState, keysToCheck) !== get(newState, keysToCheck)) {
            return true
        }
    }
    return false
}

/**
 * Runs any version of stored state through a series of transformations that
 * migrates it to the latest version of stored state.
 */
async function migrateStoredState(
    state: AnyStoredState,
    storage: StorageApi,
): Promise<LatestStoredState> {
    let migrationState = { ...state }
    // Version 0 -> 1
    if (migrationState.version === 0) {
        migrationState = {
            ...migrationState,
            version: 1,
            language: null,
            currency: null,
            activeFederationId: null,
            authenticatedGuardian: null,
            chatIdentities: {},
        }
    }

    // Version 1 -> 2
    if (migrationState.version === 1) {
        const { chatIdentities, ...rest } = migrationState
        migrationState = {
            ...rest,
            version: 2,
            chat: Object.entries(chatIdentities).reduce<StoredStateV2['chat']>(
                (chat, [federationId, authenticatedMember]) => {
                    if (authenticatedMember) {
                        chat[federationId] = {
                            authenticatedMember,
                            messages: [],
                            groups: [],
                            members: [],
                            lastFetchedMessageId: null,
                        }
                    }
                    return chat
                },
                {},
            ),
        }
    }

    // Version 2 -> 3
    if (migrationState.version === 2) {
        // Add lastReadMessageIds to chat state. Initiailize it with every chat
        // considered "read" by having its latest message ID added to the map.
        const oldChat = migrationState.chat
        const newChat = Object.entries(oldChat).reduce(
            (prevChat, [federationId, chatState]) => {
                if (!chatState) return prevChat
                const myId = chatState.authenticatedMember?.id
                if (!myId) return prevChat
                const lastReadMessageIds = getLatestMessageIdsForChats(
                    chatState.messages,
                    myId,
                )
                const lastSeenMessageId =
                    getLatestMessage(chatState.messages)?.id || null
                return {
                    ...prevChat,
                    [federationId]: {
                        ...chatState,
                        lastReadMessageIds,
                        lastSeenMessageId,
                    },
                }
            },
            {} as StoredStateV3['chat'],
        )
        migrationState = {
            ...migrationState,
            version: 3,
            chat: newChat,
        }
    }

    // Version 3 -> 4
    if (migrationState.version === 3) {
        const oldChat = migrationState.chat
        const newChat = Object.entries(oldChat).reduce(
            (prevChat, [federationId, chatState]) => {
                if (!chatState) return prevChat
                if (!chatState.groupRoles) return prevChat
                const groupAffiliations = Object.entries(
                    chatState.groupRoles,
                ).reduce(
                    (prevGroup, [groupId, role]) => {
                        if (!role) return prevGroup
                        return {
                            [groupId]: role === 'moderator' ? 'owner' : 'none',
                        }
                    },
                    {} as Record<Chat['id'], string | undefined>,
                )
                return {
                    ...prevChat,
                    [federationId]: {
                        ...chatState,
                        groupAffiliations,
                    },
                }
            },
            {} as StoredStateV4['chat'],
        )
        migrationState = {
            ...migrationState,
            version: 4,
            chat: newChat,
        }
    }

    // Version 4 -> 5
    if (migrationState.version === 4) {
        migrationState = {
            ...migrationState,
            version: 5,
            externalMeta: {},
        }
    }

    // Version 5 -> 6
    if (migrationState.version === 5) {
        migrationState = {
            ...migrationState,
            version: 6,
            btcExchangeRates: {},
        }
    }

    // Version 6 -> 7
    if (migrationState.version === 6) {
        migrationState = {
            ...migrationState,
            version: 7,
            onchainDepositsEnabled: false,
            developerMode: false,
        }
    }

    // Version 7 -> 8
    if (migrationState.version === 7) {
        const { btcExchangeRates, ...rest } = migrationState
        const btcUsdRate = btcExchangeRates['USD'] || 0
        migrationState = {
            ...rest,
            version: 8,
            btcUsdRate,
            fiatUsdRates: {},
        }
    }

    // Version 8 -> 9
    if (migrationState.version === 8) {
        migrationState = {
            ...migrationState,
            version: 9,
            stableBalanceEnabled: false,
        }
    }

    // Version 9 -> 10
    if (migrationState.version === 9) {
        const oldChat = migrationState.chat
        const newChat = Object.entries(oldChat).reduce(
            (prevChat, [federationId, chatState]) => {
                // Add lastSeenPaymentUpdateId to chat state. Initiailize it with every payment
                // update considered "seen" by setting the message ID of its latest payment update
                if (!chatState) return prevChat
                const myId = chatState.authenticatedMember?.id
                if (!myId) return prevChat

                const lastReadPaymentUpdateIds =
                    getLatestPaymentUpdateIdsForChats(chatState.messages, myId)
                const lastSeenPaymentUpdate = getLatestPaymentUpdate(
                    chatState.messages,
                )
                const lastSeenPaymentUpdateId = lastSeenPaymentUpdate?.id
                    ? `${lastSeenPaymentUpdate?.id}_${
                          lastSeenPaymentUpdate?.payment?.updatedAt || 0
                      }`
                    : null
                return {
                    ...prevChat,
                    [federationId]: {
                        ...chatState,
                        lastReadPaymentUpdateIds,
                        lastSeenPaymentUpdateId,
                    },
                }
            },
            {} as StoredStateV10['chat'],
        )
        migrationState = {
            ...migrationState,
            version: 10,
            chat: newChat,
        }
    }

    if (migrationState.version === 10) {
        migrationState = {
            ...migrationState,
            version: 11,
            nuxSteps: {},
        }
    }

    if (migrationState.version === 11) {
        // Add new `joinedAt` field to chat groups. Use the earliest message in
        // the chat, and if it has no messages, use the current time since it's
        // likely a very new chat.
        const oldChat = migrationState.chat
        const newChat = Object.entries(oldChat).reduce(
            (prevChat, [federationId, chatState]) => {
                if (!chatState) return prevChat
                const groups = chatState.groups.map(group => {
                    let joinedAt = Date.now()
                    chatState.messages.forEach(msg => {
                        if (msg.sentIn !== group.id) return
                        joinedAt = Math.min(joinedAt, msg.sentAt)
                    })
                    return { ...group, joinedAt }
                })
                return {
                    ...prevChat,
                    [federationId]: {
                        ...chatState,
                        groups,
                    },
                }
            },
            oldChat,
        )
        migrationState = {
            ...migrationState,
            version: 12,
            chat: newChat,
        }
    }

    // Version 12 -> 13
    if (migrationState.version === 12) {
        migrationState = {
            ...migrationState,
            version: 13,
            showFiatTxnAmounts: true,
        }
    }

    // Version 13 -> 14
    if (migrationState.version === 13) {
        const oldChat = migrationState.chat
        const newChat = Object.entries(oldChat).reduce(
            (prevChat, [federationId, chatState]) => {
                if (!chatState) return prevChat
                const myId = chatState.authenticatedMember?.id
                if (!myId) return prevChat

                const {
                    lastReadMessageIds,
                    lastReadPaymentUpdateIds,
                    lastSeenMessageId,
                    lastSeenPaymentUpdateId,
                } = chatState

                // Find the last read message and extract its timestamp
                const lastReadMessageTimestamps = Object.keys(
                    lastReadMessageIds,
                ).reduce(
                    (result, chatId) => {
                        const msgId = lastReadMessageIds[chatId]
                        const paymentUpdateId = lastReadPaymentUpdateIds[chatId]
                        const lastReadMessage = chatState.messages.find(
                            m => m.id === msgId,
                        )
                        // If the last read payment update has a later timestamp, use that instead
                        const lastReadPaymentUpdate = chatState.messages.find(
                            m => m.id === paymentUpdateId,
                        )
                        if (lastReadMessage) {
                            result[chatId] = lastReadMessage.sentAt
                            if (
                                lastReadPaymentUpdate &&
                                lastReadPaymentUpdate.payment?.updatedAt &&
                                lastReadPaymentUpdate.payment?.updatedAt >
                                    lastReadMessage.sentAt
                            ) {
                                result[chatId] =
                                    lastReadPaymentUpdate.payment?.updatedAt
                            }
                        }
                        return result
                    },
                    {} as Record<Chat['id'], number>,
                )

                // Find the last seen message and extract its timestamp
                let lastSeenMessageTimestamp = null
                const lastSeenMessage = chatState.messages.find(
                    m => m.id === lastSeenMessageId,
                )
                const lastSeenPaymentUpdate = chatState.messages.find(
                    m => m.id === lastSeenPaymentUpdateId,
                )
                if (lastSeenMessage) {
                    lastSeenMessageTimestamp = lastSeenMessage.sentAt
                    // If the last seen payment update has a later timestamp, use that instead
                    if (
                        lastSeenPaymentUpdate &&
                        lastSeenPaymentUpdate.payment?.updatedAt &&
                        lastSeenPaymentUpdate.payment?.updatedAt >
                            lastSeenMessage.sentAt
                    ) {
                        lastSeenMessageTimestamp =
                            lastSeenPaymentUpdate.payment?.updatedAt
                    }
                }

                const migratedChatState = omit(chatState, [
                    'lastReadMessageIds',
                    'lastReadPaymentUpdateIds',
                    'lastSeenMessageId',
                    'lastSeenPaymentUpdateId',
                ])

                return {
                    ...prevChat,
                    [federationId]: {
                        ...migratedChatState,
                        lastReadMessageTimestamps,
                        lastSeenMessageTimestamp,
                    },
                }
            },
            {} as StoredStateV14['chat'],
        )
        migrationState = {
            ...migrationState,
            version: 14,
            chat: newChat,
        }
    }

    // Version 14 -> 15
    if (migrationState.version === 14) {
        migrationState = {
            ...migrationState,
            version: 15,
            matrixAuth: null,
        }
    }

    // Version 15 -> 16
    if (migrationState.version === 15) {
        // Attempts to migrate the legacy deviceId
        const legacyDeviceId = await storage.getItem('deviceId')
        migrationState = {
            ...migrationState,
            version: 16,
            deviceId: legacyDeviceId || undefined,
        }
        // TODO: run this line in a future migration to clean up the key
        // storage.removeItem('deviceId')
    }

    // Version 16 -> 17
    if (migrationState.version === 16) {
        migrationState = {
            ...migrationState,
            version: 17,
            protectedFeatures: {
                app: true,
                changePin: true,
            },
        }
    }

    // Version 17 -> 18
    if (migrationState.version === 17) {
        migrationState = {
            ...migrationState,
            version: 18,
            customGlobalMods: {},
            customGlobalModVisibility: {},
            suggestedGlobalModVisibility: {},
        }
    }

    // Version 18 -> 19
    if (migrationState.version === 18) {
        const {
            customGlobalModVisibility,
            suggestedGlobalModVisibility,
            ...rest
        } = migrationState
        migrationState = {
            ...rest,
            version: 19,
            modVisibility: {
                // migrate the global mods visibility settings
                ...Object.entries(suggestedGlobalModVisibility ?? {}).reduce(
                    (acc, [modId, visibility]) => {
                        acc[modId] = {
                            ...visibility,
                            isGlobal: true,
                        }
                        return acc
                    },
                    {} as Record<string, ModVisibility>,
                ),
                // migrate all the stored custom mods
                ...Object.entries(migrationState.customGlobalMods ?? {}).reduce(
                    (acc, [modId, mod]) => {
                        if (!mod) return acc
                        acc[modId] = {
                            isHidden: false,
                            isCustom: true,
                        } as ModVisibility
                        return acc
                    },
                    {} as Record<string, ModVisibility>,
                ),
                // Override the default visibility setting
                // with any existing settings on the custom mods
                ...Object.entries(customGlobalModVisibility ?? {}).reduce(
                    (acc, [modId, visibility]) => {
                        if (!visibility) return acc
                        acc[modId] = {
                            ...visibility,
                            isCustom: true,
                        } as ModVisibility
                        return acc
                    },
                    {} as Record<string, ModVisibility>,
                ),
            },
        }
    }

    if (migrationState.version === 19) {
        migrationState = {
            ...migrationState,
            version: 20,
            protectedFeatures: {
                ...migrationState.protectedFeatures,
                nostrSettings: true,
            },
        }
    }

    if (migrationState.version === 20) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { chat, ...rest } = migrationState
        migrationState = {
            ...rest,
            version: 21,
        }
    }

    if (migrationState.version === 21) {
        migrationState = {
            ...migrationState,
            version: 22,
            support: {
                supportPermissionGranted: false,
                zendeskPushNotificationToken: null,
            },
        }
    }

    if (migrationState.version === 22) {
        migrationState = {
            ...migrationState,
            version: 23,
            customFederationCurrencies: {},
        }
    }

    return migrationState
}
