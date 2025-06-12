import { ThemeProvider } from '@rneui/themed'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { makeLog } from '@fedi/common/utils/log'

import Router from './Router'
import { subscribeToBridgeEvents, unsubscribeFromBridgeEvents } from './bridge'
import FediBridgeInitializer from './components/FediBridgeInitializer'
import { InternetIsUnreachableBadge } from './components/feature/environment/InternetIsUnreachableBadge'
import { ErrorScreen } from './screens/ErrorScreen'
import { BackupRecoveryProvider } from './state/contexts/BackupRecoveryContext'
import { NotificationContextProvider } from './state/contexts/NotificationContext'
import { OmniLinkContextProvider } from './state/contexts/OmniLinkContext'
import { PinContextProvider } from './state/contexts/PinContext'
import ProviderComposer from './state/contexts/ProviderComposer'
import { initializeNativeStore, store } from './state/store'
import theme from './styles/theme'

const log = makeLog('FediBridgeInitializer')

const App = () => {
    // Initialize redux store
    useEffect(() => {
        const unsubscribe = initializeNativeStore()
        return unsubscribe
    }, [])

    // Initialize Native Event Listeners
    useEffect(() => {
        let listeners: Awaited<ReturnType<typeof subscribeToBridgeEvents>>

        const subscribe = async () => {
            listeners = await subscribeToBridgeEvents()
            log.info('initialized bridge listeners')
        }

        subscribe()

        return () => {
            unsubscribeFromBridgeEvents(listeners)
        }
    }, [])

    return (
        <SafeAreaProvider>
            <ThemeProvider theme={theme}>
                <ErrorBoundary fallback={props => <ErrorScreen {...props} />}>
                    <ReduxProvider store={store}>
                        <FediBridgeInitializer>
                            <ProviderComposer
                                providers={[
                                    BackupRecoveryProvider,
                                    OmniLinkContextProvider,
                                    PinContextProvider,
                                    NotificationContextProvider,
                                ]}>
                                {<Router />}
                                <InternetIsUnreachableBadge />
                            </ProviderComposer>
                        </FediBridgeInitializer>
                    </ReduxProvider>
                </ErrorBoundary>
            </ThemeProvider>
        </SafeAreaProvider>
    )
}

export default App
