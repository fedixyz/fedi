import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import React, { useEffect } from 'react'

import { selectOnboardingCompleted } from '@fedi/common/redux'
import { selectStorageIsReady } from '@fedi/common/redux/storage'

import { Column } from '../components/ui/Flex'
import SvgImage from '../components/ui/SvgImage'
import { useAppSelector } from '../state/hooks'
import {
    NavigationArgs,
    NavigationHook,
    RootStackParamList,
} from '../types/navigation'
import { useIsFeatureUnlocked } from '../utils/hooks/security'
import {
    consumePendingUnlockNavigationArgs,
    navigationArgsToResetAction,
} from '../utils/linking'

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

        // if FediBridgeInitializer detects a device id mismatch,
        // we need to force the user to the migrated device screen
        if (shouldMigrateSeed) {
            const destination: NavigationArgs = ['MigratedDevice']
            return navigation.replace(...destination)
        }

        if (onboardingCompleted === false) {
            const destination: NavigationArgs = ['Splash']
            return navigation.replace(...destination)
        }

        const pendingUnlockDestination = consumePendingUnlockNavigationArgs()
        const destination: NavigationArgs = pendingUnlockDestination ?? [
            'TabsNavigator',
        ]

        // If PIN-protected, navigate to the Lock Screen
        if (!isAppUnlocked) {
            return navigation.replace('LockScreen', {
                routeParams: destination,
            })
        }

        if (pendingUnlockDestination) {
            return navigation.dispatch(
                navigationArgsToResetAction(pendingUnlockDestination),
            )
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
            <SvgImage size="lg" name="FediLogoIcon" />
        </Column>
    )
}

export default Initializing
