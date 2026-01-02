import { CommonActions } from '@react-navigation/native'

import { ChatType } from '@fedi/common/types'

import { RootStackParamList } from '../types/navigation'

export function navigate(
    screenName: keyof RootStackParamList,
    params?: RootStackParamList[keyof RootStackParamList],
) {
    return CommonActions.navigate(screenName, params)
}

export function navigateToHome() {
    return CommonActions.navigate('TabsNavigator', {
        screen: 'Home',
    })
}

export function reset(
    screenName: keyof RootStackParamList,
    params?: RootStackParamList[keyof RootStackParamList],
) {
    return CommonActions.reset({
        index: 0,
        routes: [{ name: screenName, params }],
    })
}

export function resetAfterPersonalRecovery() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [{ name: 'PersonalRecoverySuccess' }],
        }),
    }
}

export function resetAfterFailedSocialRecovery() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [{ name: 'SocialRecoveryFailure' }],
        }),
    }
}

export function resetAfterSocialRecovery() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [{ name: 'SocialRecoverySuccess' }],
        }),
    }
}

export function resetToChatSettings(roomId: string) {
    return {
        ...CommonActions.reset({
            index: 2,
            routes: [
                { name: 'TabsNavigator', params: { screen: 'Chat' } },
                { name: 'ChatRoomConversation', params: { roomId } },
                {
                    name: 'RoomSettings',
                    params: { roomId },
                },
            ],
        }),
    }
}

export function resetToJoinFederation() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [{ name: 'PublicFederations' }],
        }),
    }
}

export function resetToLockedDevice() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [{ name: 'LockedDevice' }],
        }),
    }
}

export function resetToDirectChat(roomId: string) {
    // Reset navigation stack on going back to the chat to give better back
    // button behavior if directed here from Omni.
    return {
        ...CommonActions.reset({
            index: 1,
            routes: [
                { name: 'TabsNavigator', params: { initialRouteName: 'Chat' } },
                {
                    name: 'ChatRoomConversation',
                    params: {
                        roomId: roomId,
                        chatType: ChatType.direct,
                    },
                },
            ],
        }),
    }
}

export function resetToGroupChat(roomId: string) {
    // Reset navigation stack on going back to the chat to give better back
    // button behavior if directed here from Omni.
    return {
        ...CommonActions.reset({
            index: 1,
            routes: [
                { name: 'TabsNavigator', params: { initialRouteName: 'Chat' } },
                {
                    name: 'ChatRoomConversation',
                    params: {
                        roomId: roomId,
                        chatType: ChatType.group,
                    },
                },
            ],
        }),
    }
}

export function resetToSocialRecovery() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [{ name: 'CompleteSocialRecovery' }],
        }),
    }
}
export function resetToChatsScreen() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [
                { name: 'TabsNavigator', params: { initialRouteName: 'Chat' } },
            ],
        }),
    }
}

export function resetToWallets() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [
                {
                    name: 'TabsNavigator',
                    params: { initialRouteName: 'Federations' },
                },
            ],
        }),
    }
}

export function resetToMiniapps() {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [
                {
                    name: 'TabsNavigator',
                    params: { initialRouteName: 'Mods' },
                },
            ],
        }),
    }
}

export function resetAfterSendSuccess({
    title,
    formattedAmount,
    description,
    federationId,
}: RootStackParamList['SendSuccessShield']) {
    return {
        ...CommonActions.reset({
            index: 0,
            routes: [
                {
                    name: 'TabsNavigator',
                    params: { initialRouteName: 'Federations', federationId },
                },
                {
                    name: 'SendSuccessShield',
                    params: {
                        title,
                        formattedAmount,
                        description,
                        federationId,
                    },
                },
            ],
        }),
    }
}
