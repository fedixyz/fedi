import { isDevOrNightly } from '../utils/environment'

export const WEB_APP_URL = 'https://app.fedi.xyz'
export const WEB_APP_URL_STAGING = 'https://fedi-ashen.vercel.app'

// When working on the API endpoints locally, comment out which one you want to
// use. Otherwise it'll default to staging
export const API_ORIGIN = isDevOrNightly ? WEB_APP_URL_STAGING : WEB_APP_URL
// export const API_ORIGIN = '' // Local PWA (relative path)
// export const API_ORIGIN = 'http://localhost:3000' // Local iOS
// export const API_ORIGIN = 'http://10.0.2.2:3000' // Local Android

// TODO: move these to URLs hosted on app.fedi.xyz
export const FEDIBTC_META_JSON_URL = 'https://meta.dev.fedibtc.com/meta.json'
export const PUBLIC_COMMUNITIES_META_JSON_URL = isDevOrNightly
    ? `${API_ORIGIN}/meta-communities-nightly.json`
    : 'https://meta.dev.fedibtc.com/meta-communities.json'
