import { Linking, Platform } from 'react-native'

import {
    ANDROID_APP_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/release'

export function openAppStore() {
    if (Platform.OS === 'android') {
        Linking.openURL(ANDROID_APP_STORE_URL)
    } else if (Platform.OS === 'ios') {
        Linking.openURL(IOS_APP_STORE_URL)
    }
}
