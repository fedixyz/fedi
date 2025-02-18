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

export const emptyToken = ''
export const HELP_URL = 'https://support.fedi.xyz'
export const PRIVACY_POLICY_URL = 'https://www.fedi.xyz/privacy-policy'
export const ZENDESK_USER_SCOPE = 'user'
