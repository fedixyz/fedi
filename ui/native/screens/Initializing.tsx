import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect } from 'react'

import { selectHasSetMatrixDisplayName } from '@fedi/common/redux'
import { selectHasLoadedFromStorage } from '@fedi/common/redux/storage'

import Flex from '../components/ui/Flex'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import {
    NavigationArgs,
    NavigationHook,
    RootStackParamList,
} from '../types/navigation'
import { useIsFeatureUnlocked } from '../utils/hooks/security'

export type Props = NativeStackScreenProps<RootStackParamList, 'Initializing'>

// TODO: Replace this entire screen with FediBridgeInitializer
const Initializing: React.FC<Props> = () => {
    const navigation = useNavigation<NavigationHook>()
    const hasSetDisplayName = useAppSelector(selectHasSetMatrixDisplayName)
    const hasStorageLoaded = useAppSelector(selectHasLoadedFromStorage || false)
    const isAppUnlocked = useIsFeatureUnlocked('app')
    const shouldMigrateSeed = useAppSelector(s => s.recovery.shouldMigrateSeed)
    const hasLoaded = hasStorageLoaded

    // once everything has loaded, determine where to navigate
    useEffect(() => {
        if (!hasLoaded || isAppUnlocked === undefined) return

        let destination: NavigationArgs = ['TabsNavigator']

        // if FediBridgeInitializer detects a device id mismatch,
        // we need to force the user to the migrated device screen
        if (shouldMigrateSeed) {
            destination = ['MigratedDevice']
            return navigation.replace(...destination)
        }

        // make sure we have a display name before proceeding.
        // return early here to avoid navigating anywhere else
        // if the Splash screen is where we need to be, especially
        // because the PIN reset logic happens on the Splash screen
        if (!hasSetDisplayName) {
            destination = ['Splash']
            return navigation.replace(...destination)
        }

        // If PIN-protected, navigate to the Lock Screen
        if (!isAppUnlocked) {
            return navigation.replace('LockScreen', {
                routeParams: destination,
            })
        }

        navigation.replace(...destination)
    }, [
        hasLoaded,
        hasSetDisplayName,
        navigation,
        isAppUnlocked,
        shouldMigrateSeed,
    ])

    return (
        <Flex center style={{ width: '100%', height: '100%' }}>
            <SvgImage size={SvgImageSize.lg} name="FediLogoIcon" />
        </Flex>
    )
}

export default Initializing
