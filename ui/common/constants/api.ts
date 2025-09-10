// When working on the API endpoints locally, comment out which one you want to
// use. Otherwise it'll default to the production endpoint.
export const API_ORIGIN =
    process.env.NODE_ENV === 'development'
        ? 'https://fedi-ashen.vercel.app'
        : 'https://app.fedi.xyz'
// export const API_ORIGIN = '' // Local PWA (relative path)
// export const API_ORIGIN = 'http://localhost:3000' // Local iOS
// export const API_ORIGIN = 'http://10.0.2.2:3000' // Local Android
