import { createDrawerNavigator } from '@react-navigation/drawer'
import {
    NavigationContainer,
    useNavigationContainerRef,
} from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, View, Linking } from 'react-native'

import { useToast } from '@fedi/common/hooks/toast'
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
import {
    DRAWER_NAVIGATION_ID,
    MainNavigatorDrawerParamList,
} from './types/navigation'
import { useIsFeatureUnlocked } from './utils/hooks/security'
import { getLinkingConfig, parseLink } from './utils/linking'

const log = makeLog('NavigationRouter')

const Drawer = createDrawerNavigator<MainNavigatorDrawerParamList>()

const Router = () => {
    const { theme } = useTheme()
    const navigation = useNavigationContainerRef()
    const isAppUnlocked = useIsFeatureUnlocked('app')
    const { parseUrl } = useOmniLinkContext()

    // TEMPORARY DEEPLINK SHIM for app.fedi.xyz universal-links
    useEffect(() => {
        const originalOpenURL = Linking.openURL.bind(Linking)

        // override globally
        Linking.openURL = (rawUrl: string) => {
            // only handle the /link endpoint
            if (
                rawUrl.startsWith('https://app.fedi.xyz/link') ||
                rawUrl.startsWith('https://www.app.fedi.xyz/link')
            ) {
                // try to decode to fedi://…; if that fails, opens rawUrl
                const deep = parseLink(rawUrl, originalOpenURL)
                return originalOpenURL(deep || rawUrl)
            }

            // everything else: open as normal
            return originalOpenURL(rawUrl)
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

        routeRef.current = currentRoute?.name
        log.debug(
            `Navigating from "${previousRoute}" to "${routeRef.current}"`,
            {
                params: currentRoute?.params,
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
