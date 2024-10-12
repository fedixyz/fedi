import { createDrawerNavigator } from '@react-navigation/drawer'
import {
    NavigationContainer,
    useNavigationContainerRef,
} from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import { useCallback, useRef } from 'react'

import { useToast } from '@fedi/common/hooks/toast'
import { makeLog } from '@fedi/common/utils/log'

import ConnectedFederationsDrawer from './components/feature/federations/ConnectedFederationsDrawer'
import { OmniLinkHandler } from './components/feature/omni/OmniLinkHandler'
import Header from './components/ui/Header'
import { MainNavigator } from './screens/MainNavigator'
import SwitchingFederations from './screens/SwitchingFederations'
import { useOmniLinkContext } from './state/contexts/OmniLinkContext'
import { useMatrixHealthCheck, useMatrixPushNotifications } from './state/hooks'
import {
    DRAWER_NAVIGATION_ID,
    MainNavigatorDrawerParamList,
} from './types/navigation'
import { useIsFeatureUnlocked } from './utils/hooks/security'
import { getLinkingConfig } from './utils/linking'

const log = makeLog('NavigationRouter')

const Drawer = createDrawerNavigator<MainNavigatorDrawerParamList>()

const Router = () => {
    const { theme } = useTheme()
    const navigation = useNavigationContainerRef()
    const isAppUnlocked = useIsFeatureUnlocked('app')
    const { parseUrl } = useOmniLinkContext()

    const toast = useToast()
    const routeRef = useRef<string>()

    // Makes sure to check Matrix connection health when app is foregrounded
    useMatrixHealthCheck()

    // Publishes an FCM push notification token if chat is available
    useMatrixPushNotifications()

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

    // Handles deep linking
    const linkingConfig = getLinkingConfig(parseUrl)

    return (
        <NavigationContainer
            ref={navigation}
            theme={theme}
            linking={linkingConfig}
            onReady={() => {
                routeRef.current = navigation.getCurrentRoute()?.name
                log.debug('Navigation is ready', {
                    route: routeRef.current,
                })
            }}
            onStateChange={handleStateChange}>
            <Drawer.Navigator
                id={DRAWER_NAVIGATION_ID}
                drawerContent={ConnectedFederationsDrawer}
                screenOptions={{ swipeEnabled: isAppUnlocked }}>
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
            {isAppUnlocked && <OmniLinkHandler />}
        </NavigationContainer>
    )
}

export default Router
