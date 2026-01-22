// Welcome page
export const welcomeRoute = '/'

// Core pages
export const chatRoute = '/chat'
export const homeRoute = '/home'
export const miniAppsRoute = '/mini-apps'
export const federationsRoute = '/federations'

// Other pages
export const federationRoute = (id: string) => `${federationsRoute}/${id}`
export const communitiesRoute = '/communities'
export const communityRoute = (id: string) => `${communitiesRoute}/${id}`
export const settingsRoute = '/settings'
export const transactionsRoute = '/transactions'
export const sendRoute = '/send'
export const requestRoute = '/request'
export const ecashRoute = '/ecash'
export const onboardingRoute = '/onboarding'
export const onboardingCommunitiesRoute = `${onboardingRoute}/communities`
export const shareLogsRoute = '/share-logs'
export const onboardingJoinRoute = (inviteCode: string) =>
    `${onboardingRoute}/join?id=${inviteCode}`

// Settings
export const settingsCurrencyRoute = `${settingsRoute}/currency`
export const settingsEditProfileRoute = `${settingsRoute}/edit-profile`
export const settingsLanguageRoute = `${settingsRoute}/language`
export const settingsNostrRoute = `${settingsRoute}/nostr`
export const settingsBackupPersonalRoute = `${settingsRoute}/backup/personal`

// Chat
export const chatUserRoute = (id: string) => `${chatRoute}/user/${id}`
export const chatRoomRoute = (id: string) => `${chatRoute}/room/${id}`
export const chatNewRoute = `${chatRoute}/new`
export const chatNewRoomRoute = `${chatRoute}/new/room`
