import { createHmac } from 'crypto'
import { Platform } from 'react-native'
import * as Zendesk from 'react-native-zendesk-messaging'

import { INVALID_NAME_PLACEHOLDER } from '@fedi/common/constants/matrix'
import { useCommonSelector } from '@fedi/common/hooks/redux'
import { CommonDispatch, selectMatrixAuth } from '@fedi/common/redux'
import {
    setZendeskPushNotificationToken,
    setZendeskInitialized as setZendeskInitializedAction,
} from '@fedi/common/redux/support'
import { RpcNostrPubkey } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

// Import Redux store directly
import {
    CHANNEL_KEY_ANDROID,
    CHANNEL_KEY_IOS,
    ZENDESK_SECRET_KEY,
    ZENDESK_KID,
    ZENDESK_USER_SCOPE,
} from '../constants'
import { store } from '../state/store'

const log = makeLog('native/utils/support')

// Define the type for the Zendesk payload
export type ZendeskSupportPayload = {
    external_id: string // Unique identifier for the user
    scope: string // Required scope for Zendesk
    name: string // Name of the user
}

// Function to Base64 encode without padding
function base64UrlEncode(input: string): string {
    return Buffer.from(input, 'utf8')
        .toString('base64')
        .replace(new RegExp('=+$'), '') // Remove padding
        .replace(new RegExp('\\+', 'g'), '-') // Replace '+' with '-'
        .replace(new RegExp('\\/', 'g'), '_') // Replace '/' with '_'
}

// Function to generate a JWT token manually
export function generateZendeskTokenFromPubkey(
    userID: RpcNostrPubkey,
    secretKey: string,
    name: string,
): string {
    const payload: ZendeskSupportPayload = {
        external_id: userID.npub, // Unique user identifier
        scope: ZENDESK_USER_SCOPE, // Required by Zendesk
        name, // User's display name
    }

    const header = {
        alg: 'HS256', // Algorithm used for signing
        typ: 'JWT', // JWT type
        kid: ZENDESK_KID, // Key ID provided by Zendesk
    }

    try {
        // Encode header and payload
        const encodedHeader = base64UrlEncode(JSON.stringify(header))
        const encodedPayload = base64UrlEncode(JSON.stringify(payload))

        // Create the signature
        const signature = createHmac('sha256', secretKey)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64')
            .replace(new RegExp('=+$'), '') // Remove padding
            .replace(new RegExp('\\+', 'g'), '-') // Replace '+' with '-'
            .replace(new RegExp('\\/', 'g'), '_') // Replace '/' with '_'

        // Combine header, payload, and signature to form the token
        const token = `${encodedHeader}.${encodedPayload}.${signature}`
        return token
    } catch (error) {
        log.error('Failed to generate Zendesk token:', error)
        throw new Error(
            `Failed to generate JWT token: ${(error as Error).message}`,
        )
    }
}

export async function zendeskLogout(): Promise<void> {
    return await Zendesk.logout()
}

export async function zendeskOpenMessagingView({
    onError,
}: {
    onError?: (error: Error) => void
} = {}): Promise<void> {
    try {
        await Zendesk.openMessagingView()
        log.debug('Zendesk messaging shown successfully')
    } catch (error) {
        log.error('Failed to open Zendesk messaging view:', error)
        onError?.(error as Error)
    }
}

// Zendesk initialization logic
export async function zendeskInitialize(
    userID: RpcNostrPubkey | null,
    displayName: string,
    setZendeskInitialized: (state: boolean) => void,
    onError?: (error: Error) => void,
): Promise<void> {
    try {
        log.info('Initializing Zendesk with values:', userID, displayName)
        log.info(
            'channelKey:',
            Platform.OS === 'android' ? CHANNEL_KEY_ANDROID : CHANNEL_KEY_IOS,
        )
        log.info('secretKey:', ZENDESK_SECRET_KEY)
        log.info('kid:', ZENDESK_KID)
        await Zendesk.initialize({
            channelKey:
                Platform.OS === 'android'
                    ? CHANNEL_KEY_ANDROID
                    : CHANNEL_KEY_IOS,
        })

        log.info('Zendesk initialized successfully')
        setZendeskInitialized(true)

        if (userID) {
            const token = generateZendeskTokenFromPubkey(
                userID,
                ZENDESK_SECRET_KEY,
                displayName,
            )
            log.info('Zendesk JWT token generated successfully:', token)
            await Zendesk.login(token)
            log.info('Zendesk login successful')
        }
    } catch (error) {
        setZendeskInitialized(false)
        log.error('Zendesk initialization failed', error)
        onError?.(error as Error)
    }
}

export async function updateZendeskPushNotificationToken(
    token: string,
    dispatch: CommonDispatch,
): Promise<void> {
    try {
        log.info('Updating Zendesk push notification token:', token)

        // Update the token in Zendesk
        await Zendesk.updatePushNotificationToken(token)
        log.info('Zendesk push notification token updated successfully')

        // Dispatch the action to update Redux state
        dispatch(setZendeskPushNotificationToken(token))
        log.info(
            'Redux state updated with the new Zendesk push notification token',
        )
    } catch (error) {
        log.error('Failed to update Zendesk push notification token:', error)
        throw error
    }
}

// **Launch Zendesk Without Hooks**
export async function launchZendeskSupport(
    onError?: (error: Error) => void,
): Promise<void> {
    const storeState = store.getState()
    const zendeskInitialized = storeState.support.zendeskInitialized
    const supportPermissionGranted = storeState.support.supportPermissionGranted
    const nostrNpub = storeState.environment.nostrNpub
    const displayName = storeState.matrix.auth?.displayName || 'Fedi User'

    if (!supportPermissionGranted) {
        log.info('Zendesk support not granted. Redirecting to Help Centre.')
        return
    }

    if (!zendeskInitialized) {
        await zendeskInitialize(
            nostrNpub ?? null,
            displayName,
            (state: boolean) =>
                store.dispatch(setZendeskInitializedAction(state)),
            onError,
        )
    }

    await zendeskOpenMessagingView()
}

export function useDisplayName(): string {
    const matrixAuth = useCommonSelector(selectMatrixAuth)

    if (
        !matrixAuth ||
        matrixAuth.displayName === INVALID_NAME_PLACEHOLDER ||
        !matrixAuth.displayName.trim()
    ) {
        return 'Fedi User'
    }

    return matrixAuth.displayName
}
