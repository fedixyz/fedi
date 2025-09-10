import { createDrawerNavigator } from '@react-navigation/drawer'
import {
    NavigationContainer,
    useNavigationContainerRef,
} from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, View, Linking } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
import { isUniversalLink } from '@fedi/common/utils/linking'
import { makeLog } from '@fedi/common/utils/log'

import { fedimint } from './bridge'
import ConnectedFederationsDrawer from './components/feature/federations/ConnectedFederationsDrawer'
import { OmniLinkHandler } from './components/feature/omni/OmniLinkHandler'
import Header from './components/ui/Header'
import SvgImage, { SvgImageSize } from './components/ui/SvgImage'
import ToastManager from './components/ui/ToastManager'
import { MainNavigator } from './screens/MainNavigator'
import SwitchingFederations from './screens/SwitchingFederations'
import { useOmniLinkContext } from './state/contexts/OmniLinkContext'
import { usePinContext } from './state/contexts/PinContext'
import {
    DRAWER_NAVIGATION_ID,
    MainNavigatorDrawerParamList,
} from './types/navigation'
import { useIsFeatureUnlocked } from './utils/hooks/security'
import {
    getLinkingConfig,
    parseLink,
    setNavigationRef,
    setNavigationReady,
    handleInternalDeepLink,
    setAppUnlocked,
} from './utils/linking'

const log = makeLog('NavigationRouter')

const Drawer = createDrawerNavigator<MainNavigatorDrawerParamList>()

const Router = () => {
    const { theme } = useTheme()
    const navigation = useNavigationContainerRef()
    const isAppUnlocked = useIsFeatureUnlocked('app')
    const pin = usePinContext()
    const { parseUrl } = useOmniLinkContext()

    useEffect(() => setNavigationRef(navigation), [navigation])

    useEffect(() => {
        // Only consider app unlocked when both feature is unlocked AND PIN allows it
        const isPinReady =
            pin.status === 'unset' ||
            (pin.status === 'set' && Boolean(isAppUnlocked))

        log.info('PIN state changed', {
            pinStatus: pin.status,
            isAppUnlocked,
            isPinReady,
        })

        setAppUnlocked(isPinReady)
    }, [pin.status, isAppUnlocked])

    // DEEPLINK SHIM for app.fedi.xyz universal-links (to allow links clicked inside the app to work)
    useEffect(() => {
        const originalOpenURL = Linking.openURL.bind(Linking)

        Linking.openURL = async (raw: string): Promise<void> => {
            log.info('[shim] openURL called with:', raw)

            if (isUniversalLink(raw)) {
                log.info(
                    '[shim] Detected universal link, attempting direct handling',
                )

                // Try to handle it directly first
                const handled = handleInternalDeepLink(raw)
                if (handled) {
                    log.info('[shim] Successfully handled internally')
                    return Promise.resolve()
                }

                log.info('[shim] Not handled internally, trying parseLink')
                // Only try parseLink if direct handling failed
                const deep = parseLink(raw, () => {
                    log.info(
                        '[shim] parseLink fallback called - would treat as web URL',
                    )
                    // Don't actually call originalOpenURL here - just log
                })

                if (deep) {
                    log.info(
                        '[shim] parseLink successful, trying handleInternalDeepLink again with:',
                        deep,
                    )
                    const deepHandled = handleInternalDeepLink(deep)
                    if (deepHandled) {
                        log.info(
                            '[shim] Successfully handled converted deep link',
                        )
                        return Promise.resolve()
                    }
                }

                log.info(
                    '[shim] All internal handling failed, falling back to browser',
                )
            }

            log.info('[shim] Calling original openURL with:', raw)
            return originalOpenURL(raw)
        }

        return () => {
            Linking.openURL = originalOpenURL
        }
    }, [])

    const toast = useToast()
    const routeRef = useRef<string>()

    // Logs changes in navigation state for debugging
    const handleStateChange = useCallback(() => {
        toast.close()
        const previousRoute = routeRef.current
        const currentRoute = navigation.getCurrentRoute()

        if (previousRoute === currentRoute?.name) return

        let paramsToLog = currentRoute?.params

        if (currentRoute?.params && 'ecash' in currentRoute.params) {
            paramsToLog = {
                ...currentRoute?.params,
                ecash: '[redacted]',
            }
        }

        routeRef.current = currentRoute?.name
        log.debug(
            `Navigating from "${previousRoute}" to "${routeRef.current}"`,
            {
                params: paramsToLog,
            },
        )
    }, [navigation, toast])

    // If a nonce reuse check fails
    // Notify the user by directing them to the RecoveryFromNonceReuse screen
    useEffect(() => {
        return fedimint.addListener('nonceReuseCheckFailed', async event => {
            log.info('nonce reuse check failed', event)
            navigation.navigate('RecoverFromNonceReuse')
        })
    }, [navigation])

    // Handles deep linking
    const linkingConfig = getLinkingConfig(parseUrl)

    return (
        <NavigationContainer
            ref={navigation}
            theme={theme}
            linking={linkingConfig}
            onReady={() => {
                routeRef.current = navigation.getCurrentRoute()?.name
                log.info('Navigation is ready', {
                    route: routeRef.current,
                })

                // Mark navigation as ready and process any pending deep links
                setNavigationReady()
            }}
            fallback={
                <View style={style.container}>
                    <SvgImage size={SvgImageSize.lg} name="FediLogoIcon" />
                </View>
            }
            onStateChange={handleStateChange}>
            <Drawer.Navigator
                id={DRAWER_NAVIGATION_ID}
                drawerContent={ConnectedFederationsDrawer}
                screenOptions={{
                    swipeEnabled: isAppUnlocked,
                    freezeOnBlur: true,
                }}>
                <Drawer.Screen
                    name="MainNavigator"
                    component={MainNavigator}
                    options={{ headerShown: false }}
                />
                <Drawer.Screen
                    name="SwitchingFederations"
                    component={SwitchingFederations}
                    initialParams={{ federationId: null }}
                    options={{
                        header: () => <Header />,
                    }}
                />
            </Drawer.Navigator>
            {/*
                Only show this when the app is unlocked.
                It handles state from a context provider so it won't drop the state.
            */}
            <ToastManager />
            {isAppUnlocked && <OmniLinkHandler />}
        </NavigationContainer>
    )
}

const style = StyleSheet.create({
    container: {
        height: '100%',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'white',
    },
})

export default Router
