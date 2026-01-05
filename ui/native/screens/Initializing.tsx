import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect } from 'react'

import { selectOnboardingCompleted } from '@fedi/common/redux'
import { selectStorageIsReady } from '@fedi/common/redux/storage'

import { Column } from '../components/ui/Flex'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import {
    NavigationArgs,
    NavigationHook,
    RootStackParamList,
} from '../types/navigation'
import { useIsFeatureUnlocked } from '../utils/hooks/security'

export type Props = NativeStackScreenProps<RootStackParamList, 'Initializing'>

const Initializing: React.FC<Props> = () => {
    const navigation = useNavigation<NavigationHook>()
    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)
    const hasStorageLoaded = useAppSelector(selectStorageIsReady || false)
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

        if (onboardingCompleted === false) {
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
        onboardingCompleted,
        navigation,
        isAppUnlocked,
        shouldMigrateSeed,
    ])

    return (
        <Column center style={{ width: '100%', height: '100%' }}>
            <SvgImage size={SvgImageSize.lg} name="FediLogoIcon" />
        </Column>
    )
}

export default Initializing
