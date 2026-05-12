import { isDev, isDevOrExperimental, isLocal } from '../utils/environment'

export const WEB_APP_URL = 'https://app.fedi.xyz'
export const WEB_APP_URL_STAGING = 'https://fedi-ashen.vercel.app'
export const WEB_APP_URL_LOCAL = 'http://localhost:3000'

// Checking isLocal allows web to hit localhost endpoints and avoid CORS issues
export const API_ORIGIN = isLocal()
    ? WEB_APP_URL_LOCAL
    : isDevOrExperimental
      ? WEB_APP_URL_STAGING
      : WEB_APP_URL

// TODO: move these to URLs hosted on app.fedi.xyz
export const FEDIBTC_META_JSON_URL = 'https://meta.dev.fedibtc.com/meta.json'
export const PUBLIC_COMMUNITIES_META_JSON_URL = isDevOrExperimental
    ? `${API_ORIGIN}/meta-communities-nightly.json`
    : 'https://meta.dev.fedibtc.com/meta-communities.json'

export const getDeeplinkResumeUrl = () =>
    `${isDev() ? WEB_APP_URL_LOCAL : API_ORIGIN}/deeplink-redirect`

export const PUBLIC_FEDERATIONS_API_URL = `${API_ORIGIN}/api/federations`
export const AUTOSELECT_FEDERATIONS_API_URL = `${API_ORIGIN}/api/autoselect-federations`
