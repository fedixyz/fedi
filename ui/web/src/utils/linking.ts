import { normalizeCommunityInviteCode } from '@fedi/common/utils/linking'

import {
    chatRoute,
    chatRoomRoute,
    chatUserRoute,
    ecashRoute,
    walletRoute,
    homeRoute,
    onboardingJoinRoute,
} from '../constants/routes'

export const getDeepLinkPath = (url: string): string => {
    try {
        // returns screen=...
        const queryString = url.match(/screen.*$/)?.[0] ?? null
        if (!queryString) return '/'

        const params = new URLSearchParams(queryString)

        const page = params.get('screen')

        switch (page) {
            case 'join': {
                const inviteCode = params.get('invite') || params.get('id')
                if (!inviteCode) return homeRoute
                return onboardingJoinRoute(
                    normalizeCommunityInviteCode(inviteCode),
                )
            }
            case 'chat':
                return chatRoute
            case 'room': {
                const roomId = params.get('roomId') || params.get('id')
                if (!roomId) return chatRoute
                return chatRoomRoute(roomId)
            }
            case 'user': {
                const userId = params.get('userId') || params.get('id')
                if (!userId) return chatRoute
                return chatUserRoute(userId)
            }
            // this is for backwards compatibility
            // TODO: remove legacy /federations deeplink after some time...
            case 'federations':
            case 'wallet':
                return walletRoute
            case 'ecash': {
                const token = params.get('token') || params.get('id')
                if (!token) return '/'

                // Only use # so that ecash token isn't sent to server
                return `${ecashRoute}#id=${token}`
            }
            case 'share-logs': {
                const ticketNumber =
                    params.get('ticketNumber') || params.get('id')
                if (!ticketNumber) return '/'
                return `/share-logs?ticketNumber=${ticketNumber}`
            }
            default:
                return '/'
        }
    } catch (error) {
        return '/'
    }
}

export const getHashParams = (path = ''): Record<string, string> => {
    const afterHash = path.split('#')[1]
    const params = new URLSearchParams(afterHash)
    return Object.fromEntries(params.entries())
}
