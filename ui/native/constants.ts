//zendesk
import {
    CHANNEL_KEY_ANDROID as ENV_CHANNEL_KEY_ANDROID,
    CHANNEL_KEY_IOS as ENV_CHANNEL_KEY_IOS,
    ZENDESK_SECRET_KEY as ENV_ZENDESK_SECRET_KEY,
    ZENDESK_KID as ENV_ZENDESK_KID,
} from '@env'

import i18n from './localization/i18n'

export * from '@fedi/common/constants/bip39'
export * from '@fedi/common/constants/fedimods'

/*
    -----
    General
    -----
*/

export const FALLBACK_TERMS_URL = `https://www.fedi.xyz/btcprague`

// Regtest feds
export const FEDERATION_ALPHA =
    '{"members":[[0,"wss://alpha.regtest.sirion.io"]]}'
export const FEDERATION_BRAVO =
    '{"members":[[0,"wss://bravo.regtest.sirion.io"]]}'
// Signet feds
export const FEDERATION_SIGNET =
    '{"members":[[0,"wss://fm-signet.sirion.io:443"]]}'

export const TEST_FEDERATION = FEDERATION_ALPHA

// Websocket URL for checking BTCUSD exchange rate
export const BITFINEX_BTCUSD_WEBSOCKET_URL = 'wss://api-pub.bitfinex.com/ws/2'

/*
    -----
    Chat
    -----
*/
export const DEFAULT_GROUP_NAME = i18n.t('feature.chat.new-group')

export const CHANNEL_KEY_ANDROID = ENV_CHANNEL_KEY_ANDROID
export const CHANNEL_KEY_IOS = ENV_CHANNEL_KEY_IOS
export const ZENDESK_SECRET_KEY = ENV_ZENDESK_SECRET_KEY
export const ZENDESK_KID = ENV_ZENDESK_KID

/*
    -----
    Support
    -----
*/

export const emptyToken = ''
export const HELP_URL = 'https://support.fedi.xyz'
export const PRIVACY_POLICY_URL = 'https://www.fedi.xyz/privacy-policy'
export const ZENDESK_USER_SCOPE = 'user'

/*
    -----
    Push Notifications
    -----
*/

export const ZENDESK_PUSH_NOTIFICATION_CHANNEL = 'and-notification-channel'

/*
    -----
    Layout
    -----
*/

// Android screen size categories
export enum AndroidScreenSize {
    SMALL = 750, // <750px - small phones (5" and under)
    MEDIUM = 900, // 750-900px - standard phones (5.5-6.5")
    LARGE = 901, // 900px+ - large phones and tablets (6.5"+)
}

export const DEFAULT_ANIMATION_DURATION = 250
export const DEFAULT_KEYBOARD_HEIGHT_FALLBACK = 300
export const ANDROID_INPUT_FOCUS_OFFSET = 20

export const KEYBOARD_PADDING = {
    SMALL_MULTIPLIER: 0.08,
    LARGE_MULTIPLIER: 0.2,
    SMALL_MAX_PERCENT: 0.015,
    LARGE_MAX_PERCENT: 0.05,
} as const

export const CHAT_KEYBOARD_BEHAVIOR = {
    ANDROID_OFFSET_PERCENT: 0.025,
    MAX_BOTTOM_PERCENT: 0.5,
} as const
