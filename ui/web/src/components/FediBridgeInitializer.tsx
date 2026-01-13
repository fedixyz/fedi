import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import FediLogo from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import { FedimintProvider } from '@fedi/common/components/FedimintProvider'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    initializeDeviceIdWeb,
    initializePwaVersion,
    selectSocialRecoveryQr,
    setShouldLockDevice,
    refreshOnboardingStatus,
    selectOnboardingCompleted,
    setAppFlavor,
    selectEventListenersReady,
} from '@fedi/common/redux'
import { selectStorageIsReady } from '@fedi/common/redux/storage'
import {
    DeviceRegistrationEvent,
    PanicEvent,
} from '@fedi/common/types/bindings'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'

import { homeRoute, onboardingJoinRoute } from '../constants/routes'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint, initializeBridge } from '../lib/bridge'
import { getAppFlavor } from '../lib/bridge/worker'
import { keyframes, styled, theme } from '../styles'
import { generateDeviceId } from '../utils/browserInfo'
import { isDeepLink, getDeepLinkPath } from '../utils/linking'
import { Redirect } from './Redirect'
import { Text } from './Text'

const log = makeLog('FediBridgeInitializer')

interface Props {
    children: React.ReactNode
}

export const FediBridgeInitializer: React.FC<Props> = ({ children }) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { asPath, pathname, query } = useRouter()

    const hasLoadedStorage = useAppSelector(selectStorageIsReady)
    const eventListenersReady = useAppSelector(selectEventListenersReady)
    const socialRecoveryId = useAppSelector(selectSocialRecoveryQr)
    const shouldLockDevice = useAppSelector(s => s.recovery.shouldLockDevice)
    const deviceIndexRequired = useAppSelector(
        s => s.recovery.deviceIndexRequired,
    )
    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)

    const tRef = useUpdatingRef(t)
    const dispatchRef = useUpdatingRef(dispatch)

    const [isLoading, setIsLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!hasLoadedStorage || !eventListenersReady) return

        const initialize = async () => {
            const start = Date.now()
            try {
                const newDeviceId = generateDeviceId()
                // PWA-specific device ID handling
                const deviceId = await dispatchRef
                    .current(initializeDeviceIdWeb({ deviceId: newDeviceId }))
                    .unwrap()
                dispatchRef.current(
                    initializePwaVersion({
                        version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
                    }),
                )
                const appFlavor = getAppFlavor()
                dispatchRef.current(setAppFlavor(appFlavor))
                log.info('initializing bridge with deviceId', deviceId)
                await initializeBridge(deviceId)

                const stop = Date.now()
                log.info('initialized:', stop - start, 'ms')
                await dispatchRef
                    .current(refreshOnboardingStatus(fedimint))
                    .unwrap()
            } catch (err) {
                setError(
                    formatErrorMessage(
                        tRef.current,
                        err,
                        'errors.unknown-error',
                    ),
                )
            } finally {
                setIsLoading(false)
            }
        }

        initialize()
    }, [dispatchRef, hasLoadedStorage, eventListenersReady, tRef])

    // Show an error message if the bridge panics while running.
    useEffect(() => {
        // Initialize panic listener
        const unsubscribePanic = fedimint.addListener(
            'panic',
            (ev: PanicEvent) => {
                setError(ev.message)
            },
        )

        // Initialize locked device listener
        const unsubscribeDeviceRegistration = fedimint.addListener(
            'deviceRegistration',
            (ev: DeviceRegistrationEvent) => {
                log.info('DeviceRegistrationEvent', ev)
                if (ev.state === 'conflict') {
                    dispatchRef.current(setShouldLockDevice(true))
                }
            },
        )

        return () => {
            unsubscribePanic()
            unsubscribeDeviceRegistration()
        }
    }, [dispatchRef])

    if (isLoading) {
        return (
            <Content>
                <Loader>
                    <FediLogo width={50} />
                </Loader>
            </Content>
        )
    }

    if (error) {
        return (
            <Content>
                <ErrorMessage>
                    <Text>{error}</Text>
                </ErrorMessage>
            </Content>
        )
    }

    if (shouldLockDevice) {
        return (
            <Content>
                <Text>{'🔒'}</Text>
                <Text variant="h2">
                    {t('feature.recovery.wallet-moved-title')}
                </Text>
                <Text variant="body">
                    {t('feature.recovery.wallet-moved-desc')}
                </Text>
            </Content>
        )
    }

    // Navigates to personal recovery flow here because the user entered
    // seed words but quit the app before completing device index selection
    if (
        deviceIndexRequired &&
        asPath !== '/onboarding/recover/wallet-transfer' &&
        !asPath.includes('recover')
    ) {
        return <Redirect path="/onboarding/recover/wallet-transfer" />
    }

    // If mid social recovery, force them to stay on the page
    if (socialRecoveryId && asPath !== '/onboarding/recover/social') {
        return <Redirect path="/onboarding/recover/social" />
    }

    // Handle deep links
    if (isDeepLink(window.location.href)) {
        return <Redirect path={getDeepLinkPath(window.location.href)} />
    }

    // If onboarding is not completed, redirect to Welcome page
    // but allow access to recovery routes
    // (Note: we could move all recovery pages out of /onboarding route and into /recover)
    if (
        !onboardingCompleted &&
        pathname !== '/' &&
        !asPath.includes('recover')
    ) {
        // Preserve any query string or hash params when redirecting to Welcome page
        const params = window.location.search || window.location.hash
        return <Redirect path={`/${params}`} />
    }

    // If invite code in query string but user has already onboarded
    // then go straight to join federation page
    if (query.invite_code && pathname === '/' && onboardingCompleted) {
        return (
            <Redirect
                path={`${onboardingJoinRoute(String(query.invite_code))}`}
            />
        )
    }

    // If user has onboarded and no invite code in query string then
    // redirect user to /home
    if (onboardingCompleted && !query.invite_code && pathname === '/') {
        return <Redirect path={homeRoute} />
    }

    return <FedimintProvider fedimint={fedimint}>{children}</FedimintProvider>
}

const loaderFadeIn = keyframes({
    '0%, 50%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const rotate = keyframes({
    '0%': {
        transform: 'rotate(0deg)',
    },
    '70%': {
        transform: 'rotate(360deg)',
    },
    '100%': {
        transform: 'rotate(360deg)',
    },
})

const Content = styled('div', {
    alignItems: 'center',
    display: 'flex',
    height: '100dvh',
    flexDirection: 'column',
    gap: 10,
    justifyContent: 'center',
    padding: '0 40px',
    textAlign: 'center',
    width: '100%',
})

const Loader = styled('div', {
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    transformOrigin: 'center center',
    animation: `${rotate} 1.5s linear infinite, ${loaderFadeIn} 1s ease`,
})

const ErrorMessage = styled('div', {
    color: theme.colors.red,
    textAlign: 'center',
})
