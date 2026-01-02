import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import { setEventListenersReady } from '@fedi/common/redux'
import {
    configureLogging,
    makeLog,
    saveLogsToStorage,
} from '@fedi/common/utils/log'

import { FediBridgeInitializer } from '../components/FediBridgeInitializer'
import { PWAMetaTags } from '../components/PWAMetaTags'
import { Template } from '../components/Template'
import { ToastManager } from '../components/ToastManager'
import { InstallPromptProvider } from '../context/InstallPromptContext'
import { RouteStateProvider } from '../context/RouteStateContext'
import { useInstallPrompt } from '../hooks'
import { fedimint } from '../lib/bridge'
import { initializeWebStore, store } from '../state/store'
import { globalStyles } from '../styles'
import { logFileApi } from '../utils/logfile'

const MyApp: React.FC<AppProps> = ({ Component, pageProps }) => {
    globalStyles()

    // Need to listen to beforeinstallpromptevent at this level or it will be missed
    const deferredPrompt = useInstallPrompt()

    // Initialize redux store behavior
    useEffect(() => {
        const unsubscribe = initializeWebStore()
        store.dispatch(setEventListenersReady(true))
        return unsubscribe
    }, [])

    // Initialize bridge logger
    useEffect(() => {
        const log = makeLog('fedimint')
        const unsubscribe = fedimint.addListener('log', event => {
            log.info('log', event)
        })
        return () => unsubscribe()
    }, [])

    // Initialize logging library, force logs to save before closing the tab.
    useEffect(() => {
        configureLogging(logFileApi)
        window.addEventListener('beforeunload', saveLogsToStorage)
        return () =>
            window.removeEventListener('beforeunload', saveLogsToStorage)
    }, [])

    return (
        <>
            <PWAMetaTags />
            <ReduxProvider store={store}>
                <RouteStateProvider>
                    <InstallPromptProvider value={deferredPrompt}>
                        <FediBridgeInitializer>
                            <Template>
                                <Component {...pageProps} />
                            </Template>
                            <ToastManager />
                        </FediBridgeInitializer>
                    </InstallPromptProvider>
                </RouteStateProvider>
            </ReduxProvider>
        </>
    )
}

export default MyApp
