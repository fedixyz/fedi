import { Platform } from 'react-native'

import { selectFeatureFlag } from '@fedi/common/redux'

import { useAppSelector } from '../../state/hooks'

/**
 * Determines whether the update_screen feature flag is enabled for the current platform
 */
export function useUpdateFlagPlatformSensitive() {
    const updateScreenFlag = useAppSelector(s =>
        selectFeatureFlag(s, 'update_screen'),
    )

    return (
        updateScreenFlag?.platform === 'All' ||
        (updateScreenFlag?.platform === 'IOS' && Platform.OS === 'ios') ||
        (updateScreenFlag?.platform === 'Android' && Platform.OS === 'android')
    )
}
