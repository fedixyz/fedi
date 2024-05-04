import messaging from '@react-native-firebase/messaging'
import { ThemeProvider } from '@rneui/themed'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'
import { makeLog } from '@fedi/common/utils/log'

import Router from './Router'
import FediBridgeInitializer from './components/FediBridgeInitializer'
import ToastManager from './components/ui/ToastManager'
import { ErrorScreen } from './screens/ErrorScreen'
import { BackupRecoveryProvider } from './state/contexts/BackupRecoveryContext'
import { OmniLinkContextProvider } from './state/contexts/OmniLinkContext'
import ProviderComposer from './state/contexts/ProviderComposer'
import { initializeNativeStore, store } from './state/store'
import theme from './styles/theme'

const log = makeLog('App')

const App = () => {
    // Initialize redux store
    useEffect(() => {
        const unsubscribe = initializeNativeStore()
        return unsubscribe
    }, [])

    // TODO: Remove this? Do we need this to handle incoming push notifications
    // while the app is open?
    useEffect(() => {
        const unsubscribe = messaging().onMessage(async remoteMessage => {
            log.info('push notification received', remoteMessage)
        })

        return unsubscribe
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
                                ]}>
                                {<Router />}
                                <ToastManager />
                            </ProviderComposer>
                        </FediBridgeInitializer>
                    </ReduxProvider>
                </ErrorBoundary>
            </ThemeProvider>
        </SafeAreaProvider>
    )
}

export default App
