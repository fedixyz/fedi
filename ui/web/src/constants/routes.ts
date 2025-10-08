// Welcome page
export const welcomeRoute = '/'

// Core pages
export const chatRoute = '/chat'
export const homeRoute = '/home'
export const modsRoute = '/mods'
export const scanRoute = '/scan'
export const federationsRoute = '/federations'
export const federationRoute = (id: string) => `${federationsRoute}/${id}`
export const settingsRoute = '/settings'
export const transactionsRoute = '/transactions'
export const sendRoute = '/send'
export const requestRoute = '/request'

// Other pages
export const onboardingRoute = '/onboarding'
export const shareLogsRoute = '/share-logs'

// Sub pages

// Onboarding
export const onboardingJoinRoute = `${onboardingRoute}/join`

// Settings
export const settingsCurrencyRoute = `${settingsRoute}/currency`
export const settingsEditProfileRoute = `${settingsRoute}/edit-profile`
export const settingsLanguageRoute = `${settingsRoute}/language`
export const settingsNostrRoute = `${settingsRoute}/nostr`
export const settingsBackupPersonalRoute = `${settingsRoute}/backup/personal`

// Chat
export const chatUserRoute = (id: string) => `${chatRoute}/user/${id}`
export const chatRoomRoute = (id: string) => `${chatRoute}/room/${id}`
