// When working on the API endpoints locally, comment out which one you want to
// use. Otherwise it'll default to staging
export const API_ORIGIN =
    process.env.FEDI_ENV === 'nightly' || process.env.NODE_ENV === 'development'
        ? 'https://fedi-ashen.vercel.app'
        : 'https://app.fedi.xyz'
// export const API_ORIGIN = '' // Local PWA (relative path)
// export const API_ORIGIN = 'http://localhost:3000' // Local iOS
// export const API_ORIGIN = 'http://10.0.2.2:3000' // Local Android

// TODO: move these to URLs hosted on app.fedi.xyz
export const FEDIBTC_META_JSON_URL = 'https://meta.dev.fedibtc.com/meta.json'
export const PUBLIC_COMMUNITIES_META_JSON_URL =
    process.env.FEDI_ENV === 'nightly' || process.env.NODE_ENV === 'development'
        ? `${API_ORIGIN}/meta-communities-nightly.json`
        : 'https://meta.dev.fedibtc.com/meta-communities.json'
