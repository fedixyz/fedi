import {
    chatRoute,
    chatRoomRoute,
    chatUserRoute,
    homeRoute,
    scanRoute,
    sendRoute,
    transactionsRoute,
} from '../constants/routes'

const DEEP_LINK_PATH = '/link'

export const isDeepLink = (pathname: string): boolean => {
    return pathname.startsWith(DEEP_LINK_PATH)
}

export const getDeepLinkPath = (link: string): string => {
    try {
        // remove "/link(#|?)" from the link
        const cleanLink = link.slice(DEEP_LINK_PATH.length + 1)

        const params = new URLSearchParams(cleanLink)

        const page = params.get('screen')

        switch (page) {
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
            case 'scan':
                return scanRoute
            case 'transactions':
                return transactionsRoute
            case 'send':
                return sendRoute
            default:
                return '/'
        }
    } catch (error) {
        return '/'
    }
}
