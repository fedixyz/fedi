import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import FediLogo from '@fedi/common/assets/svgs/fedi-logo-icon.svg'
import { INVALID_NAME_PLACEHOLDER } from '@fedi/common/constants/matrix'
import { useObserveMatrixSyncStatus } from '@fedi/common/hooks/matrix'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    fetchRegisteredDevices,
    fetchSocialRecovery,
    initializeDeviceIdWeb,
    initializeFedimintVersion,
    initializeNostrKeys,
    previewAllDefaultChats,
    refreshFederations,
    selectSocialRecoveryQr,
    selectMatrixStarted,
    setDeviceIndexRequired,
    setShouldLockDevice,
    startMatrixClient,
    setMatrixDisplayName,
    selectHasSetMatrixDisplayName,
    setMatrixSetup,
    selectMatrixStatus,
    selectMatrixAuth,
} from '@fedi/common/redux'
import { selectHasLoadedFromStorage } from '@fedi/common/redux/storage'
import { MatrixSyncStatus } from '@fedi/common/types'
import {
    DeviceRegistrationEvent,
    PanicEvent,
} from '@fedi/common/types/bindings'
import { generateRandomDisplayName } from '@fedi/common/utils/chat'
import { formatErrorMessage } from '@fedi/common/utils/format'
import { makeLog } from '@fedi/common/utils/log'

import { useAppDispatch, useAppSelector } from '../hooks'
import { fedimint, initializeBridge } from '../lib/bridge'
import { keyframes, styled, theme } from '../styles'
import { generateDeviceId } from '../utils/browserInfo'
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

    const started = useAppSelector(selectMatrixStarted)
    const hasLoadedStorage = useAppSelector(selectHasLoadedFromStorage)
    const socialRecoveryId = useAppSelector(selectSocialRecoveryQr)
    const hasSetMatrixDisplayName = useAppSelector(
        selectHasSetMatrixDisplayName,
    )
    const shouldLockDevice = useAppSelector(s => s.recovery.shouldLockDevice)
    const deviceIndexRequired = useAppSelector(
        s => s.recovery.deviceIndexRequired,
    )
    const isMatrixSetup = useAppSelector(s => s.matrix.setup)
    const syncStatus = useAppSelector(selectMatrixStatus)
    const matrixAuth = useAppSelector(selectMatrixAuth)

    const tRef = useUpdatingRef(t)
    const dispatchRef = useUpdatingRef(dispatch)

    const [isLoading, setIsLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)

    useObserveMatrixSyncStatus(started)

    useEffect(() => {
        if (!hasLoadedStorage) return

        const newDeviceId = generateDeviceId()

        dispatchRef
            .current(initializeDeviceIdWeb({ deviceId: newDeviceId }))
            .unwrap()
            .then(deviceId => initializeBridge(deviceId))
            .then(() => fedimint.bridgeStatus())
            .then(status => {
                log.info('bridgeStatus', status)

                const promises = [
                    dispatchRef.current(fetchSocialRecovery(fedimint)),
                    dispatchRef.current(initializeNostrKeys({ fedimint })),

                    // this happens when the user entered seed words but quit the app
                    // before completing device index selection so we fetch devices
                    // again since that typically gets fetched from recoverFromMnemonic
                    ...(status?.deviceIndexAssignmentStatus === 'unassigned'
                        ? [
                              dispatchRef.current(setDeviceIndexRequired(true)),
                              dispatchRef.current(
                                  // TODO: make sure this is offline-friendly? should it be?
                                  fetchRegisteredDevices(fedimint),
                              ),
                          ]
                        : []),

                    // if there is no matrix session yet we will start the matrix
                    // client either during recovery or during onboarding after a
                    // display name is entered
                    ...(status?.matrixSetup
                        ? [
                              dispatchRef.current(
                                  startMatrixClient({ fedimint }),
                              ),
                              dispatchRef.current(setMatrixSetup(true)),
                          ]
                        : []),
                ]

                return Promise.all(promises)
            })

            .then(() => {
                return dispatchRef
                    .current(refreshFederations(fedimint))
                    .unwrap()
            })
            .then(() => {
                dispatchRef.current(previewAllDefaultChats())
                dispatchRef.current(initializeFedimintVersion({ fedimint }))
            })
            .catch(err =>
                setError(
                    formatErrorMessage(
                        tRef.current,
                        err,
                        'errors.unknown-error',
                    ),
                ),
            )
            .finally(() => setIsLoading(false))
    }, [dispatchRef, hasLoadedStorage, tRef])

    // Set random displayName when bridge has synced unless the user
    // has one (which could have been done on another device before recovery)
    useEffect(() => {
        if (
            syncStatus === MatrixSyncStatus.synced &&
            !isMatrixSetup &&
            (!matrixAuth?.displayName ||
                matrixAuth?.displayName === INVALID_NAME_PLACEHOLDER)
        ) {
            dispatch(
                setMatrixDisplayName({
                    displayName: generateRandomDisplayName(2),
                }),
            )

            dispatch(setMatrixSetup(true))
        }
    }, [
        dispatch,
        hasSetMatrixDisplayName,
        isMatrixSetup,
        matrixAuth?.displayName,
        syncStatus,
    ])

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

    // If matrix hasn't been initialized redirect to Welcome page
    // but allow access to recovery routes
    // (Note: we could move all recovery pages out of /onboarding route and into /recover)
    if (
        syncStatus === MatrixSyncStatus.uninitialized &&
        pathname !== '/' &&
        !asPath.includes('recover')
    ) {
        return <Redirect path="/" />
    }

    // If invite code in query string but user has already onboarded
    // then go straight to join federation page
    if (query.invite_code && pathname === '/' && isMatrixSetup) {
        return (
            <Redirect
                path={`/onboarding/join?invite_code=${query.invite_code}`}
            />
        )
    }

    // If user has onboarded and no invite code in query string then
    // redirect user to /home
    if (isMatrixSetup && !query.invite_code && asPath === '/') {
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
