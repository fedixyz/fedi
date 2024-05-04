import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import {
    configureLogging,
    makeLog,
    saveLogsToStorage,
} from '@fedi/common/utils/log'

import { FediBridgeInitializer } from '../components/FediBridgeInitializer'
import { PWAMetaTags } from '../components/PWAMetaTags'
import { Template } from '../components/Template'
import { ToastManager } from '../components/ToastManager'
import { RouteStateProvider } from '../context/RouteStateContext'
import { fedimint } from '../lib/bridge'
import { store, initializeWebStore } from '../state/store'
import { globalStyles } from '../styles'
import { asyncLocalStorage } from '../utils/localstorage'

const MyApp: React.FC<AppProps> = ({ Component, pageProps }) => {
    globalStyles()

    // Initialize redux store behavior
    useEffect(() => {
        const unsubscribe = initializeWebStore()
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
        configureLogging(asyncLocalStorage)
        window.addEventListener('beforeunload', saveLogsToStorage)
        return () =>
            window.removeEventListener('beforeunload', saveLogsToStorage)
    }, [])

    return (
        <>
            <PWAMetaTags />
            <ReduxProvider store={store}>
                <RouteStateProvider>
                    <FediBridgeInitializer>
                        <Template>
                            <Component {...pageProps} />
                        </Template>
                        <ToastManager />
                    </FediBridgeInitializer>
                </RouteStateProvider>
            </ReduxProvider>
        </>
    )
}

export default MyApp
