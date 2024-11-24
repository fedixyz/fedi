import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import FediLogo from '@fedi/common/assets/svgs/fedi-logo.svg'
import { useUpdatingRef } from '@fedi/common/hooks/util'
import {
    fetchSocialRecovery,
    initializeDeviceId,
    previewAllDefaultChats,
    refreshFederations,
    selectAuthenticatedMember,
    selectDeviceId,
    selectHasSetMatrixDisplayName,
    selectSocialRecoveryQr,
    startMatrixClient,
} from '@fedi/common/redux'
import { selectHasLoadedFromStorage } from '@fedi/common/redux/storage'
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
    const { asPath } = useRouter()
    const deviceId = useAppSelector(selectDeviceId)
    const hasLoadedStorage = useAppSelector(selectHasLoadedFromStorage)
    const socialRecoveryId = useAppSelector(selectSocialRecoveryQr)
    const authenticatedMember = useAppSelector(selectAuthenticatedMember)
    const hasSetDisplayName = useAppSelector(selectHasSetMatrixDisplayName)
    const [isInitialized, setIsInitialized] = useState(false)
    const [isShowingLoading, setIsShowingLoading] = useState(false)
    const [error, setError] = useState<string>()
    const tRef = useUpdatingRef(t)
    const dispatchRef = useUpdatingRef(dispatch)

    const hasLegacyChatData = !!authenticatedMember

    // Initialize device ID
    useEffect(() => {
        const handleDeviceId = async () => {
            await dispatchRef
                .current(initializeDeviceId({ getDeviceId: generateDeviceId }))
                .unwrap()
        }
        if (!deviceId && hasLoadedStorage) handleDeviceId()
    }, [deviceId, dispatchRef, hasLoadedStorage])

    useEffect(() => {
        if (!deviceId) return
        const loadingTimeout = setTimeout(() => {
            setIsShowingLoading(true)
        }, 1000)

        initializeBridge(deviceId)
            .then(() => fedimint.bridgeStatus())
            .then(status => {
                log.info('bridgeStatus', status)
                // Fetch federations, social recovery, and matrix setup in parallel after bridge
                // is initialized. Only throw (via unwrap) for refreshFederations.
                return Promise.all([
                    dispatchRef.current(refreshFederations(fedimint)).unwrap(),
                    dispatchRef.current(fetchSocialRecovery(fedimint)),
                    // if there is no matrix session yet we will start the matrix
                    // client either during recovery or during onboarding after a
                    // display name is entered
                    ...(status?.matrixSetup
                        ? [dispatchRef.current(startMatrixClient({ fedimint }))]
                        : []),
                ])
            })
            .then(() => {
                setIsInitialized(true)
                dispatchRef.current(previewAllDefaultChats())
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
            .finally(() => {
                setIsShowingLoading(false)
                clearTimeout(loadingTimeout)
            })

        return () => clearTimeout(loadingTimeout)
    }, [deviceId, dispatchRef, tRef])

    // Show an error message if the bridge panics while running.
    useEffect(() => {
        const unsubscribe = fedimint.addListener('panic', ev => {
            setError(ev.message)
        })
        return () => unsubscribe()
    }, [])

    if (isInitialized && !error) {
        // If we're mid social recovery, force them to stay on the page
        if (socialRecoveryId && asPath !== '/onboarding/recover/social') {
            return <Redirect path="/onboarding/recover/social" />
        }
        // If they haven't set a display name, force them into onboarding
        if (
            !hasSetDisplayName &&
            !hasLegacyChatData &&
            !asPath.startsWith('/onboarding')
        ) {
            return <Redirect path="/onboarding" />
        }
        // Otherwise render the page as normal
        return <>{children}</>
    }

    let message
    if (error) {
        message = error
    } else if (isShowingLoading) {
        message = 'Running Fedi...'
    }

    return (
        <Loader>
            <FediLogo />
            {message && (
                <Message error={!!error}>
                    <Text>{message}</Text>
                </Message>
            )}
        </Loader>
    )
}

const loaderFadeIn = keyframes({
    '0%, 50%': { opacity: 0 },
    '100%': { opacity: 1 },
})

const Loader = styled('div', {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 80,
    width: 120,
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    animation: `${loaderFadeIn} 400ms ease`,

    '& svg': {
        height: '100%',
        width: '100%',
    },
})

const messageFadeUp = keyframes({
    '0%': {
        transform: 'translateX(-50%) translateY(10px)',
        opacity: 0,
    },
    '100%': {
        transform: 'translateX(-50%) translateY(0)',
        opacity: 0.6,
    },
})

const Message = styled('div', {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100vw',
    maxWidth: 300,
    textAlign: 'center',
    animation: `${messageFadeUp} 600ms ease 1 forwards`,

    variants: {
        error: {
            true: {
                color: theme.colors.red,
            },
        },
    },
})
