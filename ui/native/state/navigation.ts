import { CommonActions } from '@react-navigation/native'

import { ChatType } from '@fedi/common/types'

import { RootStackParamList, TypedRoute } from '../types/navigation'

/**
 * Type-safe navigation helpers.
 *
 * resetStack and navigateToScreen are the only two call sites for
 * CommonActions in the codebase. Both CommonActions.reset() and
 * CommonActions.navigate() are banned everywhere via eslint/no-restricted-syntax
 * (see .eslintrc.js for more details).
 */

function resetStack(index: number, routes: TypedRoute[]) {
    // eslint-disable-next-line no-restricted-syntax
    return CommonActions.reset({ index, routes })
}

function navigateToScreen<K extends keyof RootStackParamList>(
    name: K,
    ...args: undefined extends RootStackParamList[K]
        ? [params?: RootStackParamList[K]]
        : [params: RootStackParamList[K]]
) {
    // eslint-disable-next-line no-restricted-syntax
    return CommonActions.navigate(name, args[0] as object | undefined)
}

// Public navigation API
// ---------

export { navigateToScreen as navigate }

export function navigateToHome() {
    return navigateToScreen('TabsNavigator', { initialRouteName: 'Home' })
}

export function reset<K extends keyof RootStackParamList>(
    screenName: K,
    ...args: undefined extends RootStackParamList[K]
        ? [params?: RootStackParamList[K]]
        : [params: RootStackParamList[K]]
) {
    return resetStack(0, [{ name: screenName, params: args[0] } as TypedRoute])
}

export function resetAfterPersonalRecovery() {
    return resetStack(0, [{ name: 'PersonalRecoverySuccess' }])
}

export function resetAfterFailedSocialRecovery() {
    return resetStack(0, [{ name: 'SocialRecoveryFailure' }])
}

export function resetAfterSocialRecovery() {
    return resetStack(0, [{ name: 'SocialRecoverySuccess' }])
}

export function resetToChatSettings(roomId: string) {
    return resetStack(2, [
        { name: 'TabsNavigator', params: { initialRouteName: 'Chat' } },
        { name: 'ChatRoomConversation', params: { roomId } },
        { name: 'RoomSettings', params: { roomId } },
    ])
}

export function resetToJoinFederation() {
    return resetStack(0, [{ name: 'PublicFederations' }])
}

export function resetToLockedDevice() {
    return resetStack(0, [{ name: 'LockedDevice' }])
}

export function resetToDirectChat(roomId: string) {
    return resetStack(1, [
        { name: 'TabsNavigator', params: { initialRouteName: 'Chat' } },
        {
            name: 'ChatRoomConversation',
            params: { roomId, chatType: ChatType.direct },
        },
    ])
}

export function resetToGroupChat(roomId: string) {
    return resetStack(1, [
        { name: 'TabsNavigator', params: { initialRouteName: 'Chat' } },
        {
            name: 'ChatRoomConversation',
            params: { roomId, chatType: ChatType.group },
        },
    ])
}

export function resetToSocialRecovery() {
    return resetStack(0, [{ name: 'CompleteSocialRecovery' }])
}

export function resetToChatsScreen() {
    return resetStack(0, [
        { name: 'TabsNavigator', params: { initialRouteName: 'Chat' } },
    ])
}

export function resetToWallets() {
    return resetStack(0, [
        { name: 'TabsNavigator', params: { initialRouteName: 'Wallet' } },
    ])
}

export function resetToMiniapps() {
    return resetStack(0, [
        { name: 'TabsNavigator', params: { initialRouteName: 'Mods' } },
    ])
}

export function resetToHomeWithScreen(
    homeTab: 'Home' | 'Wallet',
    afterScreen: TypedRoute,
) {
    return resetStack(1, [
        { name: 'TabsNavigator', params: { initialRouteName: homeTab } },
        afterScreen,
    ])
}

export function resetAfterSendSuccess({
    title,
    formattedAmount,
    description,
    federationId,
}: RootStackParamList['SendSuccessShield']) {
    return resetStack(0, [
        { name: 'TabsNavigator', params: { initialRouteName: 'Wallet' } },
        {
            name: 'SendSuccessShield',
            params: { title, formattedAmount, description, federationId },
        },
    ])
}
