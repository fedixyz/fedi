import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
    selectLastUsedTab,
} from '@fedi/common/redux'
import { selectStorageIsReady } from '@fedi/common/redux/storage'
import { DeviceRegistrationEvent } from '@fedi/common/types/bindings'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint, initializeBridge } from '../lib/bridge'
import { getAppFlavor } from '../lib/bridge/worker'
import { keyframes, styled } from '../styles'
import { generateDeviceId } from '../utils/browserInfo'
import {
    getRecoveryRedirectPath,
    getRedirectPath,
    getUnauthenticatedRedirectPath,
} from '../utils/nav'
import { Icon } from './Icon'
import { Redirect } from './Redirect'
import { Text } from './Text'

const log = makeLog('FediBridgeInitializer')

interface Props {
    children: React.ReactNode
}

export const FediBridgeInitializer: React.FC<Props> = ({ children }) => {
    const dispatch = useAppDispatch()
    const { t } = useTranslation()
    const { asPath, pathname } = useRouter()

    const hasLoadedStorage = useAppSelector(selectStorageIsReady)
    const eventListenersReady = useAppSelector(selectEventListenersReady)
    const socialRecoveryId = useAppSelector(selectSocialRecoveryQr)
    const shouldLockDevice = useAppSelector(s => s.recovery.shouldLockDevice)
    const deviceIndexRequired = useAppSelector(
        s => s.recovery.deviceIndexRequired,
    )
    const onboardingCompleted = useAppSelector(selectOnboardingCompleted)
    const lastUsedTab = useAppSelector(selectLastUsedTab)

    const tRef = useUpdatingRef(t)
    const dispatchRef = useUpdatingRef(dispatch)

    const [isLoading, setIsLoading] = useState<boolean>(true)
    const [error, setError] = useState<Error | null>(null)

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
                await initializeBridge(deviceId, appFlavor)

                const stop = Date.now()
                log.info('initialized:', stop - start, 'ms')
                await dispatchRef
                    .current(refreshOnboardingStatus(fedimint))
                    .unwrap()

                // Best-effort backup of seed words to localStorage as a
                // safety net against OPFS database corruption.
                try {
                    const words = await fedimint.getMnemonic()
                    localStorage.setItem('fedi:seed_backup', words.join(' '))
                } catch {
                    // Seed may not exist yet (pre-onboarding)
                }
            } catch (err) {
                const e: Error =
                    err instanceof Error ? err : new Error('Unknown error')

                setError(e)
            } finally {
                setIsLoading(false)
            }
        }

        initialize()
    }, [dispatchRef, hasLoadedStorage, eventListenersReady, tRef])

    // Show an error message if the bridge panics while running.
    useEffect(() => {
        // Initialize panic listener
        const unsubscribePanic = fedimint.addListener('panic', () => {
            setError(new Error('Bridge Error'))
        })

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
                    <Icon icon="FediLogoIcon" size={50} />
                </Loader>
            </Content>
        )
    }

    if (error) {
        throw error
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

    const recoveryRedirectPath = getRecoveryRedirectPath({
        asPath,
        pathname,
        deviceIndexRequired,
        socialRecoveryId,
    })

    if (recoveryRedirectPath) {
        return <Redirect path={recoveryRedirectPath} />
    }

    if (onboardingCompleted) {
        const redirectPath = getRedirectPath({
            asPath,
            pathname,
            hasLoadedStorage,
            lastUsedTab,
        })

        if (redirectPath) {
            return <Redirect path={redirectPath} />
        }
    } else {
        const redirectPath = getUnauthenticatedRedirectPath({
            asPath,
            pathname,
            href: window.location.href,
        })

        if (redirectPath) {
            return <Redirect path={redirectPath} />
        }
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
    display: 'inline-flex',
    height: 50,
    lineHeight: 0,
    transformOrigin: 'center center',
    width: 50,
    animation: `${rotate} 1.5s linear infinite, ${loaderFadeIn} 1s ease`,
})
