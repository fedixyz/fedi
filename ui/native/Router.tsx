import {
    NavigationContainer,
    createNavigationContainerRef,
} from '@react-navigation/native'
import { useTheme } from '@rneui/themed'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'

import { useFedimint } from '@fedi/common/hooks/fedimint'
import { useToast } from '@fedi/common/hooks/toast'
import { selectOnboardingCompleted, setLastUsedTab } from '@fedi/common/redux'
import { HomeNavigationTab } from '@fedi/common/types/linking'
import { makeLog } from '@fedi/common/utils/log'

import { OmniLinkHandler } from './components/feature/omni/OmniLinkHandler'
import SvgImage from './components/ui/SvgImage'
import ToastManager from './components/ui/ToastManager'
import { MainNavigator } from './screens/MainNavigator'
import { useOmniLinkContext } from './state/contexts/OmniLinkContext'
import { useAppDispatch, useAppSelector } from './state/hooks'
import { RootStackParamList } from './types/navigation'
import { useHandleDeferredLink } from './utils/hooks/linking'
import { useIsFeatureUnlocked } from './utils/hooks/security'
import {
    consumePendingUnlockExternalUrl,
    getLinking,
    flushPendingLinks,
    patchLinkingOpenURL,
} from './utils/linking'

const log = makeLog('NavigationRouter')

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

patchLinkingOpenURL(navigationRef)

const Router = () => {
    const { parseUrl } = useOmniLinkContext()
    const { theme } = useTheme()

    const dispatch = useAppDispatch()
    const fedimint = useFedimint()
    const toast = useToast()

    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)
    const isAppUnlocked = useIsFeatureUnlocked('app')

    const routeRef = useRef<string | undefined>(undefined)

    // This is needed because we need to pass a fallback to getLinking
    // so that payment protocol deeplinks like bitcoin:// and lightning://
    // are handled by our omni parser.
    // We also need a stable ref for this fallback function to prevent re-subscribing
    // to Linking.getInitialURL and getting stuck in a loop of overlay re-renders
    const parseUrlRef = useRef(parseUrl)
    parseUrlRef.current = parseUrl
    const isAppUnlockedRef = useRef(isAppUnlocked)
    isAppUnlockedRef.current = isAppUnlocked
    const linking = useMemo(
        () =>
            getLinking(
                onboardingCompleted,
                () => isAppUnlockedRef.current,
                dispatch,
                url => parseUrlRef.current(url),
            ),
        [onboardingCompleted, dispatch],
    )

    useHandleDeferredLink()

    // Fires any payment URI that was stashed while the app was locked
    useEffect(() => {
        if (isAppUnlocked !== true) return
        const url = consumePendingUnlockExternalUrl()
        if (url) parseUrlRef.current(url)
    }, [isAppUnlocked])

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
            case 'Wallet':
                dispatch(setLastUsedTab(HomeNavigationTab.Wallet))
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
            linking={linking}
            onReady={() => {
                routeRef.current = navigationRef.getCurrentRoute()?.name
                flushPendingLinks(navigationRef)
                log.info('Navigation is ready', {
                    route: routeRef.current,
                })
            }}
            fallback={
                <View style={style.container}>
                    <SvgImage size="lg" name="FediLogoIcon" />
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
