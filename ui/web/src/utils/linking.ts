import {
    chatRoute,
    chatRoomRoute,
    chatUserRoute,
    ecashRoute,
    federationsRoute,
    homeRoute,
    onboardingJoinRoute,
    scanRoute,
} from '../constants/routes'

// if url contains /link?screen or /link#screen then it's a deep link
export const isDeepLink = (url: string): boolean => {
    return /\/link[?#]screen/.test(url)
}

export const getDeepLinkPath = (url: string): string => {
    try {
        // returns screen=...
        const queryString = url.match(/screen.*$/)?.[0] ?? null
        if (!queryString) return '/'

        const params = new URLSearchParams(queryString)

        const page = params.get('screen')

        switch (page) {
            case 'join': {
                const inviteCode = params.get('id')
                if (!inviteCode) return homeRoute
                return onboardingJoinRoute(inviteCode)
            }
            case 'room': {
                const roomId = params.get('id')
                if (!roomId) return chatRoute
                return chatRoomRoute(roomId)
            }
            case 'user': {
                const userId = params.get('id')
                if (!userId) return chatRoute
                return chatUserRoute(userId)
            }
            case 'home':
                return homeRoute
            case 'chat':
                return chatRoute
            case 'federations':
                return federationsRoute
            case 'scan':
                return scanRoute
            case 'ecash': {
                const tokenId = params.get('id')
                if (!tokenId) return '/'

                // Only use # so that ecash token isn't sent to server
                return `${ecashRoute}#id=${tokenId}`
            }
            default:
                return '/'
        }
    } catch (error) {
        return '/'
    }
}

export const getHashParams = (path: string): Record<string, string> => {
    const afterHash = path.split('#')[1]
    const params = new URLSearchParams(afterHash)
    return Object.fromEntries(params.entries())
}
