import { useNavigation } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Theme, useTheme } from '@rneui/themed'
import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import SplashScreen from 'react-native-splash-screen'

import {
    refreshFederations,
    selectActiveFederation,
    selectAuthenticatedMember,
} from '@fedi/common/redux'
import { selectHasLoadedFromStorage } from '@fedi/common/redux/storage'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from '../bridge'
import SvgImage, { SvgImageSize } from '../components/ui/SvgImage'
import { useAppDispatch, useAppSelector } from '../state/hooks'
import { NavigationHook, RootStackParamList } from '../types/navigation'
import { ErrorScreen } from './ErrorScreen'

const log = makeLog('Initializing')

export type Props = NativeStackScreenProps<RootStackParamList, 'Initializing'>

const Initializing: React.FC<Props> = () => {
    const dispatch = useAppDispatch()
    const navigation = useNavigation<NavigationHook>()
    const { theme } = useTheme()
    const activeFederation = useAppSelector(selectActiveFederation)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const hasStorageLoaded = useAppSelector(selectHasLoadedFromStorage)
    const [hasRefreshedFederations, setHasRefreshedFederations] =
        useState(false)
    const [bridgeError, setBridgeError] = useState<unknown | null>(null)

    const hasLoaded = hasStorageLoaded && hasRefreshedFederations
    const hasFederation = !!activeFederation
    const hasAuthenticatedMember = !!authenticatedMember

    // Refresh federations from bridge
    useEffect(() => {
        const initializeFederations = async () => {
            try {
                await dispatch(refreshFederations(fedimint)).unwrap()
                setHasRefreshedFederations(true)
            } catch (err) {
                log.error('initializeFederations', err)
                setBridgeError(err)
            }
        }
        initializeFederations().finally(() => SplashScreen.hide())
    }, [dispatch])

    // once everything has loaded, determine where to navigate
    useEffect(() => {
        const doNavigation = async () => {
            if (!hasLoaded) return

            if (hasFederation) {
                // Otherwise, go Home
                return navigation.replace('TabsNavigator')
            } else {
                // If this RPC resolves with something truthy, then they are doing social recovery
                const socialRecoveryActive = await fedimint
                    .recoveryQr()
                    .then(qr => !!qr)
                    .catch(() => false)
                // If they don't have a federation and are doing social recovery, go to social recovery QR screen
                if (socialRecoveryActive) {
                    return navigation.replace('CompleteSocialRecovery')
                }
                // Otherwise go to splash and have them join a federation
                return navigation.replace('Splash')
            }
        }
        doNavigation()
    }, [hasLoaded, hasFederation, hasAuthenticatedMember, navigation])

    if (bridgeError) {
        return <ErrorScreen error={bridgeError} />
    }

    return (
        <View style={styles(theme).container}>
            <SvgImage size={SvgImageSize.lg} name="FediLogoGradient" />
        </View>
    )
}

const styles = (_: Theme) =>
    StyleSheet.create({
        container: {
            height: '100%',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
        },
        imageBackground: {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        },
    })

export default Initializing
