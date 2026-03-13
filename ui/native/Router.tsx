import {
    NavigationContainer,
    createNavigationContainerRef,
} from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import { useCallback, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { selectOnboardingCompleted, setLastUsedTab } from '@fedi/common/redux'
import { HomeNavigationTab } from '@fedi/common/types/linking'
import { makeLog } from '@fedi/common/utils/log'

import { OmniLinkHandler } from './components/feature/omni/OmniLinkHandler'
import SvgImage, { SvgImageSize } from './components/ui/SvgImage'
import ToastManager from './components/ui/ToastManager'
import { MainNavigator } from './screens/MainNavigator'
import { useAppDispatch, useAppSelector } from './state/hooks'
import { RootStackParamList } from './types/navigation'
import { useHandleDeferredLink } from './utils/hooks/linking'
import { useIsFeatureUnlocked } from './utils/hooks/security'
import {
    getLinking,
    flushPendingLinks,
    patchLinkingOpenURL,
} from './utils/linking'

const log = makeLog('NavigationRouter')

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

patchLinkingOpenURL(navigationRef)

const Router = () => {
    const { theme } = useTheme()

    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()

    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)
    const isAppUnlocked = useIsFeatureUnlocked('app')

    const routeRef = useRef<string | undefined>(undefined)

    useHandleDeferredLink()

    // Logs changes in navigation state for debugging
    const handleStateChange = useCallback(() => {
        toast.close()
        const previousRoute = routeRef.current
        const currentRoute = navigationRef.getCurrentRoute()

        if (previousRoute === currentRoute?.name) return

        // Preserve last-used tab
        switch (currentRoute?.name) {
            case 'Home':
                dispatch(setLastUsedTab(HomeNavigationTab.Home))
                break
            case 'Chat':
                dispatch(setLastUsedTab(HomeNavigationTab.Chat))
                break
            case 'Mods':
                dispatch(setLastUsedTab(HomeNavigationTab.MiniApps))
                break
            case 'Federations':
                dispatch(setLastUsedTab(HomeNavigationTab.Wallets))
                break
        }

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
    }, [toast, dispatch])

    // If a nonce reuse check fails
    // Notify the user by directing them to the RecoveryFromNonceReuse screen
    useEffect(() => {
        return fedimint.addListener('nonceReuseCheckFailed', async event => {
            log.info('nonce reuse check failed', event)
            navigationRef.navigate('RecoverFromNonceReuse')
        })
    }, [fedimint])

    return (
        <NavigationContainer
            ref={navigationRef}
            theme={theme}
            linking={getLinking(onboardingCompleted, dispatch)}
            onReady={() => {
                routeRef.current = navigationRef.getCurrentRoute()?.name
                flushPendingLinks(navigationRef)
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
            <MainNavigator />
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
