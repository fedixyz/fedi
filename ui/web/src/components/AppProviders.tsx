import React, { useEffect } from 'react'
import { Provider as ReduxProvider } from 'react-redux'

import StabilityPoolMonitorManager from '@fedi/common/components/StabilityPoolMonitorManager'
import { setEventListenersReady } from '@fedi/common/redux'
import { makeLog, saveLogsToStorage } from '@fedi/common/utils/log'

import { FediBridgeInitializer } from '../components/FediBridgeInitializer'
import { Template } from '../components/Template'
import { ToastManager } from '../components/ToastManager'
import { InstallPromptProvider } from '../context/InstallPromptContext'
import { RouteStateProvider } from '../context/RouteStateContext'
import { useInstallPrompt, useInternetConnectionStatus } from '../hooks'
import { fedimint } from '../lib/bridge'
import { initializeWebStore, store } from '../state/store'

function EnvironmentListener() {
    useInternetConnectionStatus()
    return null
}

export default function AppProviders({
    children,
}: {
    children: React.ReactNode
}) {
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

    // Save any queued logs before the browser tears down the page.
    useEffect(() => {
        window.addEventListener('beforeunload', saveLogsToStorage)
        return () =>
            window.removeEventListener('beforeunload', saveLogsToStorage)
    }, [])

    return (
        <>
            <ReduxProvider store={store}>
                <EnvironmentListener />
                <RouteStateProvider>
                    <InstallPromptProvider value={deferredPrompt}>
                        <FediBridgeInitializer>
                            <StabilityPoolMonitorManager />
                            <Template>{children}</Template>
                            <ToastManager />
                        </FediBridgeInitializer>
                    </InstallPromptProvider>
                </RouteStateProvider>
            </ReduxProvider>
        </>
    )
}
