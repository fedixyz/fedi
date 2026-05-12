import { isDev } from '../utils/environment'

export const DEEPLINK_HOSTS = [
    'app.fedi.xyz',
    'link.fedi.xyz',
    'fedi-ashen.vercel.app',
    ...(isDev() ? ['localhost'] : []),
]
export const LINK_PATH = '/link'
export const TELEGRAM_BASE_URL = 't.me'
export const WHATSAPP_BASE_URL = 'wa.me'
export const FEDI_PREFIX = 'fedi://'

export const IOS_APP_STORE_URL =
    'https://apps.apple.com/us/app/fedi-alpha/id6448916281'
export const ANDROID_PLAY_STORE_URL =
    'https://play.google.com/store/apps/details?id=com.fedi'

// TODO: get permalink for support articles
export const STABLE_BALANCE_SUPPORT_ARTICLE_URL =
    'https://support.fedi.xyz/hc/en-us/articles/16915303194770-What-is-Stable-Balance'

// TODO: get permalink for support articles
// TODO: get specialized support article for chat privacy?
export const CHAT_SUPPORT_ARTICLE_URL =
    'https://support.fedi.xyz/hc/en-us/articles/17509166389906-How-do-I-start-a-chat-with-someone'
