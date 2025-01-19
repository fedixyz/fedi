import i18n from './localization/i18n'

export * from '@fedi/common/constants/bip39'
export * from '@fedi/common/constants/fedimods'
export * from '@fedi/common/constants/xmpp'

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
