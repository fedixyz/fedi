import { CommonActions } from '@react-navigation/native'

import { RootStackParamList } from '../types/navigation'

export function navigate(
    screenName: keyof RootStackParamList,
    params?: RootStackParamList[keyof RootStackParamList],
) {
    return CommonActions.navigate(screenName, params)
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

export function resetAfterGroupNameUpdate(groupId: string) {
    return {
        ...CommonActions.reset({
            index: 2,
            routes: [
                { name: 'TabsNavigator', params: { screen: 'Chat' } },
                { name: 'GroupChat', params: { groupId } },
                {
                    name: 'GroupAdmin',
                    params: { groupId },
                },
            ],
        }),
    }
}
