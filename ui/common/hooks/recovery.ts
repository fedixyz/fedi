import { TFunction } from 'i18next'
import orderBy from 'lodash/orderBy'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
    createNewWallet,
    restoreMnemonic,
    cancelSocialRecovery as reduxCancelSocialRecovery,
    completeSocialRecovery as reduxCompleteSocialRecovery,
    fetchSocialRecovery as reduxFetchSocialRecovery,
    refreshSocialRecoveryState,
    selectHasCheckedForSocialRecovery,
    selectRegisteredDevices,
    selectSocialRecoveryQr,
    selectSocialRecoveryState,
    selectActiveFederationId,
    transferExistingWallet,
    refreshOnboardingStatus,
    setDeviceIndexRequired,
} from '../redux'
import { SeedWords } from '../types'
import { RpcRegisteredDevice } from '../types/bindings'
import { FedimintBridge } from '../utils/fedimint'
import { makeLog } from '../utils/log'
import { useCommonDispatch, useCommonSelector } from './redux'
import { useToast } from './toast'

const log = makeLog('common/hooks/recovery')

export function useSocialRecovery(fedimint: FedimintBridge) {
    const dispatch = useCommonDispatch()
    const hasCheckedForSocialRecovery = useCommonSelector(
        selectHasCheckedForSocialRecovery,
    )
    const socialRecoveryQr = useCommonSelector(selectSocialRecoveryQr)
    const socialRecoveryState = useCommonSelector(selectSocialRecoveryState)
    const [isCompletingRecovery, setIsCompletingRecovery] = useState(false)
    const [isCancelingRecovery, setIsCancelingRecovery] = useState(false)

    const fetchSocialRecovery = useCallback(() => {
        return dispatch(reduxFetchSocialRecovery(fedimint)).unwrap()
    }, [dispatch, fedimint])

    const completeSocialRecovery = useCallback(async () => {
        setIsCompletingRecovery(true)
        try {
            return await dispatch(
                reduxCompleteSocialRecovery({ fedimint }),
            ).unwrap()
        } finally {
            setIsCompletingRecovery(false)
        }
    }, [dispatch, fedimint])

    const cancelSocialRecovery = useCallback(async () => {
        setIsCancelingRecovery(true)
        try {
            return dispatch(reduxCancelSocialRecovery(fedimint)).unwrap()
        } finally {
            setIsCancelingRecovery(false)
        }
    }, [dispatch, fedimint])

    // Refresh social recovery state every 3 seconds while recovering.
    useEffect(() => {
        if (!socialRecoveryQr) return
        const refresh = async () => {
            await dispatch(refreshSocialRecoveryState(fedimint))
            timeout = setTimeout(refresh, 3000)
        }
        let timeout = setTimeout(refresh, 3000)
        return () => clearTimeout(timeout)
    }, [dispatch, fedimint, socialRecoveryQr])

    return {
        hasCheckedForSocialRecovery,
        socialRecoveryQr,
        socialRecoveryState,
        isCompletingRecovery,
        isCancelingRecovery,
        fetchSocialRecovery,
        completeSocialRecovery,
        cancelSocialRecovery,
    }
}

export function usePersonalRecovery(t: TFunction, fedimint: FedimintBridge) {
    const [recoveryInProgress, setRecoveryInProgress] = useState<boolean>(false)
    const dispatch = useCommonDispatch()
    const toast = useToast()

    const attemptRecovery = useCallback(
        async (seedWords: SeedWords, onSuccess: () => void) => {
            setRecoveryInProgress(true)
            try {
                await dispatch(
                    restoreMnemonic({
                        fedimint,
                        mnemonic: seedWords,
                    }),
                ).unwrap()
                await dispatch(refreshOnboardingStatus(fedimint))

                onSuccess()
            } catch (err) {
                toast.error(t, 'errors.recovery-failed')
            } finally {
                setRecoveryInProgress(false)
            }
        },
        [dispatch, fedimint, t, toast],
    )

    return {
        recoveryInProgress,
        attemptRecovery,
    }
}

export function useDeviceRegistration(t: TFunction, fedimint: FedimintBridge) {
    const toast = useToast()
    const dispatch = useCommonDispatch()
    const registeredDevices = useCommonSelector(selectRegisteredDevices)
    const [isProcessing, setIsProcessing] = useState<boolean>(false)

    // Feature is currently DISABLED in the UI.
    const handleNewWallet = useCallback(
        async (onSuccess: () => void) => {
            setIsProcessing(true)
            try {
                const federation = await dispatch(
                    createNewWallet({ fedimint }),
                ).unwrap()

                log.debug('createNewWallet federation:', federation)
                // federation is non-null for social recovery only
                if (federation) {
                    // TODO: go to federation preview? or auto-join
                }
                onSuccess()
            } catch (error) {
                log.error('handleNewWallet', error)
                toast.error(t, error)
            }
            setIsProcessing(false)
        },
        [dispatch, fedimint, t, toast],
    )

    const handleTransfer = useCallback(
        async (device: RpcRegisteredDevice, onSuccess: () => void) => {
            setIsProcessing(true)
            try {
                const federation = await dispatch(
                    transferExistingWallet({ fedimint, device }),
                ).unwrap()

                log.debug('transferExistingWallet federation:', federation)
                // federation is non-null for social recovery only
                if (federation) {
                    // TODO: go to federation preview? or auto-join
                }
                await dispatch(refreshOnboardingStatus(fedimint))

                // device transfer is complete, so we reset this state
                await dispatch(setDeviceIndexRequired(false))

                onSuccess()
            } catch (error) {
                log.error('transferExistingWallet', error)
                toast.error(t, error)
            } finally {
                setIsProcessing(false)
            }
        },
        [dispatch, fedimint, t, toast],
    )

    const devicesSortedByTimestamp = useMemo(() => {
        return orderBy(registeredDevices, 'lastRegistrationTimestamp', 'desc')
    }, [registeredDevices])

    return {
        registeredDevices: devicesSortedByTimestamp,
        isProcessing,
        handleTransfer,
        handleNewWallet,
    }
}

export function useRecoveryProgress(
    fedimint: FedimintBridge,
    fedimintId?: string,
) {
    const [progress, setProgress] = useState<number | undefined>(undefined)
    const activeFederationId = useCommonSelector(selectActiveFederationId)
    const federationIdToUse = fedimintId || activeFederationId

    useEffect(() => {
        const unsubscribe = fedimint.addListener('recoveryProgress', event => {
            log.info('recovery progress', event)
            if (event.federationId === federationIdToUse) {
                if (event.total === 0) {
                    setProgress(undefined)
                } else {
                    setProgress(event.complete / event.total)
                }
            }
        })

        return () => {
            unsubscribe()
        }
    }, [fedimint, federationIdToUse])

    return {
        progress,
    }
}
