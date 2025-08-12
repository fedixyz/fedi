import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import FediLogo from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import {
    ANDROID_PLAY_STORE_URL,
    IOS_APP_STORE_URL,
} from '@fedi/common/constants/linking'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    initializeDeviceIdWeb,
    initializePwaVersion,
    selectSocialRecoveryQr,
    setShouldLockDevice,
    refreshOnboardingStatus,
    selectOnboardingCompleted,
    selectMatrixAuth,
} from '@fedi/common/redux'
import { selectStorageIsReady } from '@fedi/common/redux/storage'
import {
    DeviceRegistrationEvent,
    PanicEvent,
} from '@fedi/common/types/bindings'
import { isDev } from '@fedi/common/utils/environment'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'

import { version } from '../../package.json'
import { useAppDispatch, useAppSelector, useDeviceQuery } from '../hooks'
import { fedimint, initializeBridge } from '../lib/bridge'
import { keyframes, styled, theme } from '../styles'
import { generateDeviceId, isNightly } from '../utils/browserInfo'
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
    const { isMobile, isIOS } = useDeviceQuery()

    const hasLoadedStorage = useAppSelector(selectStorageIsReady)
    const socialRecoveryId = useAppSelector(selectSocialRecoveryQr)
    const shouldLockDevice = useAppSelector(s => s.recovery.shouldLockDevice)
    const deviceIndexRequired = useAppSelector(
        s => s.recovery.deviceIndexRequired,
    )
    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const tRef = useUpdatingRef(t)
    const dispatchRef = useUpdatingRef(dispatch)

    const [isLoading, setIsLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!hasLoadedStorage) return

        const initialize = async () => {
            const start = Date.now()
            try {
                const newDeviceId = generateDeviceId()
                // PWA-specific device ID handling
                const deviceId = await dispatchRef
                    .current(initializeDeviceIdWeb({ deviceId: newDeviceId }))
                    .unwrap()
                dispatchRef.current(initializePwaVersion({ version }))
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
    }, [dispatchRef, hasLoadedStorage, tRef])

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

    // this is dev + nightly only logic to force an error if the production homeserver is still being used
    // TODO: remove this after a few months after all nightly users have updated & migrated
    useEffect(() => {
        if ((isNightly() || isDev()) && matrixAuth && matrixAuth.userId) {
            const [, homeserver] = matrixAuth.userId.split(':')
            if (homeserver !== 'staging.m1.8fa.in') {
                setError(
                    'This is an expected nightly only error intentionally forced to ensure clean metrics. Please uninstall & recover from seed.\n',
                )
            }
        }
    }, [matrixAuth])

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
    if (isDeepLink(asPath)) {
        // if the user is on mobile and has not completed onboarding
        // then redirect them to the app store
        if (!onboardingCompleted && isMobile) {
            return (
                <Redirect
                    path={isIOS ? IOS_APP_STORE_URL : ANDROID_PLAY_STORE_URL}
                />
            )
        }

        return <Redirect path={getDeepLinkPath(asPath)} />
    }

    // If onboarding is not completed, redirect to Welcome page
    // but allow access to recovery routes
    // (Note: we could move all recovery pages out of /onboarding route and into /recover)
    if (
        !onboardingCompleted &&
        pathname !== '/' &&
        !asPath.includes('recover')
    ) {
        return <Redirect path="/" />
    }

    // If invite code in query string but user has already onboarded
    // then go straight to join federation page
    if (query.invite_code && pathname === '/' && onboardingCompleted) {
        return (
            <Redirect
                path={`/onboarding/join?invite_code=${query.invite_code}`}
            />
        )
    }

    // If user has onboarded and no invite code in query string then
    // redirect user to /home
    if (onboardingCompleted && !query.invite_code && asPath === '/') {
        return <Redirect path="/home" />
    }

    return children
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
