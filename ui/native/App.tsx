import { ThemeProvider } from '@rneui/themed'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider as ReduxProvider } from 'react-redux'

import { ErrorBoundary } from '@fedi/common/components/ErrorBoundary'

import Router from './Router'
import FediBridgeInitializer from './components/FediBridgeInitializer'
import { InternetIsUnreachableBadge } from './components/feature/environment/InternetIsUnreachableBadge'
import { ErrorScreen } from './screens/ErrorScreen'
import { BackupRecoveryProvider } from './state/contexts/BackupRecoveryContext'
import { NotificationContextProvider } from './state/contexts/NotificationContext'
import { OmniLinkContextProvider } from './state/contexts/OmniLinkContext'
import { PinContextProvider } from './state/contexts/PinContext'
import ProviderComposer from './state/contexts/ProviderComposer'
import { ToastScopeProvider } from './state/contexts/ToastScopeContext'
import { initializeNativeStore, store } from './state/store'
import theme from './styles/theme'

const App = () => {
    // Initialize redux store and native event listeners
    useEffect(() => {
        const unsubscribe = initializeNativeStore()
        return unsubscribe
    }, [])

    return (
        <GestureHandlerRootView style={styles.container}>
            <SafeAreaProvider>
                <ThemeProvider theme={theme}>
                    <ErrorBoundary
                        fallback={props => (
                            <ReduxProvider store={store}>
                                <ErrorScreen {...props} />
                            </ReduxProvider>
                        )}>
                        <ReduxProvider store={store}>
                            <FediBridgeInitializer>
                                <ToastScopeProvider>
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
                                </ToastScopeProvider>
                            </FediBridgeInitializer>
                        </ReduxProvider>
                    </ErrorBoundary>
                </ThemeProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
})

export default App
